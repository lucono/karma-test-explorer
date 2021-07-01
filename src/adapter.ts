import {
	TestAdapter,
	TestLoadStartedEvent,
	TestLoadFinishedEvent,
	TestRunStartedEvent,
	TestRunFinishedEvent,
	TestSuiteEvent,
	TestEvent,
	TestInfo,
	TestSuiteInfo,
	RetireEvent
} from 'vscode-test-adapter-api';

import {
	Event,
	EventEmitter,
	workspace,
	ConfigurationChangeEvent,
	TextDocument,
	WorkspaceFolder,
	window,
	OutputChannel
} from 'vscode';

import { Logger } from './core/logger';
import { ExtensionConfig } from './core/extension-config';
import { Debugger } from './core/debugger';
import { SpecLocator } from './util/spec-locator';
import { ConfigSetting } from './core/config-setting';
import { TestType } from './api/test-infos';
import { TestLoadEvent, TestRunEvent, TestResultEvent } from './api/test-events';
import { TestManager } from './api/test-manager';
import { Disposable } from './api/disposable';
import { MainFactory } from './core/main-factory';
import { TestResolver } from './core/test-resolver';
import { Log } from './core/log';

export class Adapter implements TestAdapter {
	private specLocator?: SpecLocator;
	private isTestProcessRunning: boolean = false;
	private loadedRootSuite?: TestSuiteInfo;
	private loadedTestsById: Map<string, TestInfo | TestSuiteInfo> = new Map();
	private disposables: Disposable[] = [];
	private initDisposables: Disposable[] = [];
	private readonly testServerOutputChannel: OutputChannel;

	private readonly retireEmitter = new EventEmitter<RetireEvent>();
	private readonly testLoadEmitter = new EventEmitter<TestLoadEvent>();
	private readonly testRunEmitter = new EventEmitter<TestRunEvent | TestResultEvent>();
	private readonly autorunEmitter = new EventEmitter<void>();

	private factory!: MainFactory;
	private config!: ExtensionConfig;
	private debugger!: Debugger;
	private logger!: Logger;
	private testManager!: TestManager;

	constructor(
		public readonly workspaceFolder: WorkspaceFolder,
		private readonly configPrefix: string,
		private readonly log: Log
	) {
		this.testServerOutputChannel = window.createOutputChannel(`Karma Server`);

		this.disposables.push(
			this.testLoadEmitter,
			this.testRunEmitter,
			this.autorunEmitter,
			workspace.onDidSaveTextDocument(this.handleDocumentSaved, this),
			workspace.onDidChangeConfiguration(this.handleConfigurationChange, this)
		);

		this.init();
	}

	private init() {
		this.initDisposables.forEach(disposable => disposable.dispose());
		this.initDisposables = [];

		this.factory = new MainFactory(this.workspaceFolder, this.configPrefix, this.testServerOutputChannel, this.log);
		this.initDisposables.push(this.factory);

		this.config = this.factory.getExtensionConfig();
		this.initDisposables.push(this.config);

		this.logger = new Logger(this.log, Adapter.name, this.config.debugLoggingEnabled);
		this.initDisposables.push(this.logger);

		this.logger.info(`Initializing adapter`);

		this.specLocator = this.factory.fetchTestInfo();
		this.initDisposables.push(this.specLocator);

		this.debugger = new Debugger(this.logger);
		this.initDisposables.push(this.debugger);

		const testResolver: TestResolver = {
			resolveTest: (testId: string): TestInfo | undefined => {
				const test = this.loadedTestsById.get(testId);
				return test?.type === TestType.Test ? test : undefined;
			},

			resolveTestSuite: (testSuiteId: string): TestSuiteInfo | undefined => {
				const testSuite = this.loadedTestsById.get(testSuiteId);
				return testSuite?.type === TestType.Suite ? testSuite : undefined;
			},

			resolveRootSuite: () => this.loadedRootSuite
		};

		this.testManager = this.factory.createTestManager(
			this.testLoadEmitter,
			this.testRunEmitter as EventEmitter<TestRunEvent>,
			this.testRunEmitter as EventEmitter<TestResultEvent>,
			this.retireEmitter,
			testResolver
		);

		this.initDisposables.push(this.testManager);
	}

	public async load(): Promise<void> {
		if (this.isTestProcessRunning) {
			this.logger.debug(() => `New test load request ignored - Another test operation is still running`);
			return;
		}
		this.logger.debug(() => `Test load started`);
		return this.refresh(true);
	}

	private async reload(): Promise<void> {
		this.logger.debug(() => `Test reload started`);

		if (this.isTestProcessRunning) {
			this.logger.debug(() => `Test reload - Aborting previously running test operation`);
			await this.cancel();
		}
		return this.load();
	}

	private async refresh(isHardRefresh: boolean = false): Promise<void> {
		if (this.isTestProcessRunning) {
			this.logger.debug(
				() =>
					`Test ${isHardRefresh ? 'hard ' : ''}refresh request ignored - ` +
					`Another test operation is currently running`
			);
			return;
		}
		this.logger.debug(() => `Test ${isHardRefresh ? 'hard ' : ''}refresh started`);

		this.isTestProcessRunning = true;
		this.testLoadEmitter.fire({ type: 'started' } as TestLoadStartedEvent);
		this.specLocator = this.factory.fetchTestInfo();

		let loadedTests: TestSuiteInfo | undefined;
		let loadError: string | undefined;

		try {
			if (isHardRefresh) {
				await this.testManager.restart();
			}
			loadedTests = await this.testManager.loadTests();
		} catch (error) {
			loadError = `Failed to load tests: ${error?.message ?? error}`;
		}

		const testLoadFinishedEvent: TestLoadFinishedEvent = { type: 'finished' };

		if (loadError) {
			this.logger.error(loadError);
			testLoadFinishedEvent.errorMessage = loadError;
		} else if (loadedTests?.children?.length) {
			testLoadFinishedEvent.suite = loadedTests;
		}

		this.storeLoadedTests(loadedTests);
		this.testLoadEmitter.fire(testLoadFinishedEvent);
		this.retireEmitter.fire({});

		this.isTestProcessRunning = false;
		this.logger.debug(() => `Test loading finished`);
	}

	public async run(testIds: string[]): Promise<void> {
		if (this.isTestProcessRunning) {
			this.logger.debug(() => `New test run request ignored - Another test operation is still running`);
			return;
		}
		this.isTestProcessRunning = true;

		this.logger.debug(() => `Test run started`);
		this.logger.info(`Test run is requested for ${testIds.length} test ids: ${JSON.stringify(testIds)}`);

		const tests = testIds.map(testId => this.loadedTestsById.get(testId)).filter(test => test !== undefined) as (
			| TestInfo
			| TestSuiteInfo
		)[];

		const runAllTests = this.containsOnlyRootSuite(tests);
		const testRunId: string = Math.random().toString(36).slice(2);

		this.logger.debug(
			() =>
				`Requested ${testIds.length} test Ids resolved to ${tests.length} actual tests:` + `${JSON.stringify(tests)}`
		);

		this.logger.info(`Starting test run Id: ${testRunId}`);

		const testRunStartedEvent: TestRunStartedEvent = { type: 'started', tests: testIds, testRunId };
		this.testRunEmitter.fire(testRunStartedEvent);

		let runError: string | undefined;

		try {
			await this.testManager.runTests(runAllTests ? [] : tests);
		} catch (error) {
			runError = `Failed to run tests: ${error?.message ?? error}`;
		}

		const testRunFinishedEvent: TestRunFinishedEvent = { type: 'finished', testRunId };
		this.testRunEmitter.fire(testRunFinishedEvent);

		if (runError) {
			this.logger.error(runError);
			this.retireEmitter.fire({ tests: testIds });
		}

		this.isTestProcessRunning = false;
		this.logger.debug(() => `Test run finished`);
	}

	public async debug(tests: string[]): Promise<void> {
		await this.debugger?.manageVSCodeDebuggingSession(this.workspaceFolder, this.config.debuggerConfig);
		await this.run(tests);
	}

	public async cancel(): Promise<void> {
		this.logger.debug(() => `Aborting any currently running test operation`);
		await this.testManager.stopCurrentRun();
		this.isTestProcessRunning = false;
	}

	private containsOnlyRootSuite(tests: (TestInfo | TestSuiteInfo)[]): boolean {
		return this.loadedRootSuite !== undefined ? tests.length === 1 && tests[0] === this.loadedRootSuite : false;
	}

	private storeLoadedTests(rootSuite?: TestSuiteInfo) {
		const testsById: Map<string, TestInfo | TestSuiteInfo> = new Map();

		const processTestTree = (test: TestInfo | TestSuiteInfo): void => {
			testsById.set(test.id, test);
			if (test.type === TestType.Suite && test.children?.length) {
				test.children.forEach(childTest => processTestTree(childTest));
			}
		};

		if (rootSuite) {
			processTestTree(rootSuite);
		}
		this.loadedRootSuite = rootSuite;
		this.loadedTestsById = testsById;
	}

	private async reset() {
		this.init();
		await this.reload();
	}

	private handleConfigurationChange = async (configChangeEvent: ConfigurationChangeEvent): Promise<void> => {
		this.logger.info(`Configuration changed`);

		const hasRelevantSettingsChange = Object.values(ConfigSetting).some(setting => {
			const settingChanged = configChangeEvent.affectsConfiguration(
				`${this.configPrefix}.${setting}`,
				this.workspaceFolder.uri
			);
			if (settingChanged) {
				this.logger.debug(() => `Relevant changed config setting: ${setting}`);
			}
			return settingChanged;
		});

		if (!hasRelevantSettingsChange) {
			this.logger.info(`No relevant configuration change`);
			return;
		}
		this.logger.info(`Reloading tests with updated configuration`);

		await this.reset();
	};

	private handleDocumentSaved = async (document: TextDocument): Promise<void> => {
		const savedFile = document.uri.fsPath;

		this.logger.debug(() => `Document saved: ${savedFile}`);

		if (!this.config) {
			this.logger.debug(() => `Document saved handler - config not present. Aborting.`);
			return;
		}

		const reloadTriggerFiles = [...this.config.reloadWatchedFiles];

		if (this.config.reloadOnKarmaConfigurationFileChange) {
			reloadTriggerFiles.push(this.config.userKarmaConfFilePath);
		}
		if (this.config.envFile) {
			reloadTriggerFiles.push(this.config.envFile);
		}

		if (reloadTriggerFiles.includes(savedFile)) {
			this.logger.info(`Resetting - monitored file changed: ${savedFile}`);
			await this.reset();
		} else if (this.specLocator?.isSpecFile(savedFile) && !this.config.autoWatchEnabled) {
			const savedFileTestIds: string[] = Array.from(this.loadedTestsById.values())
				.filter(loadedTest => loadedTest.file === savedFile)
				.map(savedTest => savedTest.id);

			if (savedFileTestIds.length > 0) {
				this.logger.debug(() => `Retiring ${savedFileTestIds.length} tests ` + `from updated spec file: ${savedFile}`);
				this.retireEmitter.fire({ tests: savedFileTestIds });
			}
		}
	};

	public async dispose(): Promise<void> {
		this.disposables.forEach(disposable => disposable?.dispose());
		this.disposables = [];
	}

	get tests(): Event<TestLoadStartedEvent | TestLoadFinishedEvent> {
		return this.testLoadEmitter.event;
	}

	get testStates(): Event<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent> {
		return this.testRunEmitter.event;
	}

	get retire(): Event<RetireEvent> {
		return this.retireEmitter.event;
	}

	get autorun(): Event<void> | undefined {
		return this.autorunEmitter.event;
	}
}
