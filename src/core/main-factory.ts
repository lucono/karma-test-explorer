import { DefaultTestManager } from './default-test-manager';
import { ExtensionConfig } from './extension-config';
import { KarmaTestEventListener } from '../frameworks/karma/runner/karma-test-event-listener';
import { SpecResponseToTestSuiteInfoMapper } from '../frameworks/karma/runner/spec-response-to-test-suite-info-mapper';
import { TestSuiteOrganizer } from './test-suite-organizer';
import { EventEmitter, OutputChannel, workspace, WorkspaceFolder } from 'vscode';
import { KarmaFactory } from '../frameworks/karma/karma-factory';
import { TestLoadEvent, TestResultEvent, TestRunEvent } from '../api/test-events';
import { TestResolver } from './test-resolver';
import { SuiteAggregateTestResultProcessor } from './suite-aggregate-test-result-processor';
import { SpecLocator, SpecLocatorOptions } from '../util/spec-locator';
import { TestFactory } from '../api/test-factory';
import { PortAcquisitionManager } from '../util/port-acquisition-manager';
import { join } from 'path';
import { existsSync } from 'fs';
import { AngularFactory } from '../frameworks/angular/angular-factory';
import { CascadingTestFactory } from './cascading-test-factory';
import { TestSuiteTreeProcessor } from '../util/test-suite-tree-processor';
import { KarmaServerProcessLog } from '../frameworks/karma/server/karma-server-process-log';
import { CommandLineProcessLog } from '../util/commandline-process-handler';
import { KarmaTestEventProcessor } from '../frameworks/karma/runner/karma-test-event-processor';
import { KarmaAutoWatchTestEventProcessor } from '../frameworks/karma/runner/karma-auto-watch-test-event-processor';
import { RetireEvent } from 'vscode-test-adapter-api';
import { TestLoadProcessor } from '../frameworks/karma/runner/test-load-processor';
import { JasmineTestFramework } from '../frameworks/jasmine/jasmine-test-framework';
import { TestFramework } from '../api/test-framework';
import { TestFrameworks } from './test-frameworks';
import { MochaInterfaceStyle, MochaTestFramework } from '../frameworks/mocha/mocha-test-framework';
import { Logger } from './logger';
import { Log } from './log';

export class MainFactory {
	private disposables: { dispose(): void }[] = [];
	private readonly config: ExtensionConfig;
	private readonly logger: Logger;
	private readonly testFramework: TestFramework;

	constructor(
		workspaceFolder: WorkspaceFolder,
		configPrefix: string,
		private readonly testServerOutputChannel: OutputChannel,
		private readonly log: Log
	) {
		this.config = this.createConfig(workspaceFolder, configPrefix);
		this.logger = new Logger(log, MainFactory.name, this.config.debugLoggingEnabled);
		this.testFramework = this.getTestFramework();
	}

	public getExtensionConfig() {
		return this.config;
	}

	private createConfig(workspaceFolder: WorkspaceFolder, configPrefix: string): ExtensionConfig {
		const config = workspace.getConfiguration(configPrefix, workspaceFolder.uri);
		const configLogger = new Logger(this.log, ExtensionConfig.name, true);
		return new ExtensionConfig(config, workspaceFolder.uri.path, configLogger);
	}

	private getTestFramework(): TestFramework {
		const selectedFramework: TestFrameworks = this.config.testFramework;

		return selectedFramework === TestFrameworks.MochaBDD
			? new MochaTestFramework(MochaInterfaceStyle.BDD)
			: selectedFramework === TestFrameworks.MochaTDD
			? new MochaTestFramework(MochaInterfaceStyle.TDD)
			: new JasmineTestFramework();
	}

	public fetchTestInfo(): SpecLocator {
		this.logger.info(`Loading test info from test files`);

		const specLocatorOptions: SpecLocatorOptions = {
			ignore: this.config.excludeFiles,
			cwd: this.config.projectRootPath
		};

		return new SpecLocator(
			this.config.testFiles,
			this.testFramework.getTestInterface(),
			new Logger(this.log, SpecLocator.name, this.config.debugLoggingEnabled),
			specLocatorOptions
		);
	}

	public createTestManager(
		testLoadEventEmitter: EventEmitter<TestLoadEvent>,
		testRunEventEmitter: EventEmitter<TestRunEvent>,
		testResultEventEmitter: EventEmitter<TestResultEvent>,
		testRetireEventEmitter: EventEmitter<RetireEvent>,
		testResolver: TestResolver
	): DefaultTestManager {
		const createLogger = (loggerName: string): Logger => {
			return new Logger(this.log, loggerName, this.config.debugLoggingEnabled);
		};

		const testSuiteOrganizer = new TestSuiteOrganizer(createLogger(TestSuiteOrganizer.name));
		const testSuiteTreeProcessor = new TestSuiteTreeProcessor(createLogger(TestSuiteTreeProcessor.name));

		const suiteTestResultProcessor = new SuiteAggregateTestResultProcessor(
			testResultEventEmitter,
			testResolver,
			testSuiteTreeProcessor,
			createLogger(SuiteAggregateTestResultProcessor.name)
		);

		const specLocator = this.fetchTestInfo();

		const specToTestSuiteMapper = new SpecResponseToTestSuiteInfoMapper(
			specLocator,
			createLogger(SpecResponseToTestSuiteInfoMapper.name)
		);

		const testLoadProcessor = new TestLoadProcessor(
			specToTestSuiteMapper,
			testSuiteOrganizer,
			testSuiteTreeProcessor,
			this.config.testGrouping,
			this.config.flattenSingleChildFolders,
			this.config.projectRootPath,
			this.config.testsBasePath,
			createLogger(TestLoadProcessor.name)
		);

		const testRunEventProcessor = new KarmaTestEventProcessor(
			testResultEventEmitter,
			specToTestSuiteMapper,
			testSuiteOrganizer,
			suiteTestResultProcessor,
			this.config.testGrouping,
			this.config.projectRootPath,
			this.config.testsBasePath,
			testResolver,
			createLogger(KarmaTestEventProcessor.name)
		);

		const ambientDelegateTestEventProcessor = new KarmaTestEventProcessor(
			testResultEventEmitter,
			specToTestSuiteMapper,
			testSuiteOrganizer,
			suiteTestResultProcessor,
			this.config.testGrouping,
			this.config.projectRootPath,
			this.config.testsBasePath,
			testResolver,
			createLogger(`${KarmaTestEventProcessor.name}_Ambient`)
		);

		const watchModeTestEventProcessor = this.config.autoWatchEnabled
			? new KarmaAutoWatchTestEventProcessor(
					ambientDelegateTestEventProcessor,
					testLoadEventEmitter,
					testRunEventEmitter,
					testResultEventEmitter,
					testRetireEventEmitter,
					testLoadProcessor,
					createLogger(KarmaAutoWatchTestEventProcessor.name)
			  )
			: undefined;

		const portManager = new PortAcquisitionManager(createLogger(PortAcquisitionManager.name));

		let testManager: DefaultTestManager;
		const karmaServerProcessLog: CommandLineProcessLog = new KarmaServerProcessLog(this.testServerOutputChannel);
		const prioritizedTestFactories: Partial<TestFactory>[] = [];

		prioritizedTestFactories.unshift(
			new KarmaFactory(this.testFramework, this.config, karmaServerProcessLog, this.log)
		);

		if (this.isAngularProject()) {
			prioritizedTestFactories.unshift(
				new AngularFactory(this.config, karmaServerProcessLog, createLogger(AngularFactory.name))
			);
		}

		const karmaEventListener = new KarmaTestEventListener(
			testRunEventProcessor,
			watchModeTestEventProcessor,
			this.config.karmaReadyTimeout,
			createLogger(KarmaTestEventListener.name)
		);

		const testFactory: TestFactory = new CascadingTestFactory(
			prioritizedTestFactories,
			createLogger(CascadingTestFactory.name)
		);
		const testServerExecutor = testFactory.createTestServerExecutor();
		const testRunExecutor = testFactory.createTestRunExecutor();

		const testRunner = testFactory.createTestRunner(karmaEventListener, testLoadProcessor, testRunExecutor);

		const testServer = testFactory.createTestServer(testServerExecutor);

		testManager = new DefaultTestManager(
			testServer,
			testRunner,
			karmaEventListener,
			portManager,
			this.config.karmaPort,
			this.config.defaultSocketConnectionPort,
			createLogger(DefaultTestManager.name)
		);

		return testManager;
	}

	private isAngularProject(): boolean {
		const angularJsonPath = join(this.config.projectRootPath, 'angular.json');
		const angularCliJsonPath = join(this.config.projectRootPath, '.angular-cli.json');
		const isAngularProject = existsSync(angularJsonPath) || existsSync(angularCliJsonPath);

		this.logger.info(`Project detected to ${isAngularProject ? 'be' : 'not be'} an Angular project`);

		return isAngularProject;
	}

	public async dispose(): Promise<void> {
		this.disposables.forEach(disposable => disposable.dispose());
	}
}
