import { EventEmitter } from 'vscode';
import { RetireEvent } from 'vscode-test-adapter-api';
import { TestFactory } from '../api/test-factory';
import { KARMA_SERVER_OUTPUT_CHANNEL_NAME } from '../constants';
import { AngularFactory } from '../frameworks/angular/angular-factory';
import { hasAngularProject } from '../frameworks/angular/angular-util';
import { JasmineTestFramework } from '../frameworks/jasmine/jasmine-test-framework';
import { KarmaFactory } from '../frameworks/karma/karma-factory';
import { KarmaAutoWatchTestEventProcessor } from '../frameworks/karma/runner/karma-auto-watch-test-event-processor';
import { KarmaTestEventListener } from '../frameworks/karma/runner/karma-test-event-listener';
import { KarmaTestEventProcessor } from '../frameworks/karma/runner/karma-test-event-processor';
import { SpecResponseToTestSuiteInfoMapper } from '../frameworks/karma/runner/spec-response-to-test-suite-info-mapper';
import { TestDiscoveryProcessor } from '../frameworks/karma/runner/test-discovery-processor';
import { KarmaServerProcessLog } from '../frameworks/karma/server/karma-server-process-log';
import { MochaTestFrameworkBdd, MochaTestFrameworkTdd } from '../frameworks/mocha/mocha-test-framework';
import { Disposable } from '../util/disposable/disposable';
import { Disposer } from '../util/disposable/disposer';
import { FileHandler } from '../util/file-handler';
import { LogAppender } from '../util/logging/log-appender';
import { LogLevel } from '../util/logging/log-level';
import { SimpleLogger } from '../util/logging/simple-logger';
import { PortAcquisitionManager } from '../util/port-acquisition-manager';
import { CommandLineProcessLog } from '../util/process/command-line-process-log';
import { TestCountProcessor } from '../util/testing/test-count-processor';
import { TestTreeProcessor } from '../util/testing/test-tree-processor';
import { TestLoadEvent, TestResultEvent, TestRunEvent } from './base/test-events';
import { TestFramework } from './base/test-framework';
import { TestFrameworkName } from './base/test-framework-name';
import { TestResolver } from './base/test-resolver';
import { CascadingTestFactory } from './cascading-test-factory';
import { ConfigSetting } from './config/config-setting';
import { ExtensionConfig } from './config/extension-config';
import { DefaultTestFileParser } from './default-test-file-parser';
import { DefaultTestManager } from './default-test-manager';
import { SpecLocator, SpecLocatorOptions } from './spec-locator';
import { SuiteAggregateTestResultProcessor } from './suite-aggregate-test-result-processor';
import { TestFileParser } from './test-file-parser';
import { TestSuiteOrganizer } from './test-suite-organizer';
import { Notifications } from './vscode/notifications';
import { OutputChannelLog } from './vscode/output-channel-log';

export class MainFactory {
  private readonly disposables: Disposable[] = [];
  private readonly testFramework: TestFramework;
  private readonly specLocator: SpecLocator;
  private readonly testServerLog: LogAppender;

  constructor(
    private readonly config: ExtensionConfig,
    private readonly notifications: Notifications,
    private readonly logger: SimpleLogger
  ) {
    this.disposables.push(logger);

    this.testFramework = this.getTestFramework();
    this.logger.info(() => `Using test framework: ${this.testFramework.name}`);

    this.specLocator = this.createSpecLocator();
    this.disposables.push(this.specLocator);

    this.testServerLog = new OutputChannelLog(KARMA_SERVER_OUTPUT_CHANNEL_NAME, {
      enabled: config.karmaLogLevel !== LogLevel[LogLevel.DISABLE]
    });
    this.disposables.push(this.testServerLog);
  }

  private getTestFramework(): TestFramework {
    const selectedFramework: TestFrameworkName = this.config.testFramework;

    return selectedFramework === TestFrameworkName.MochaBDD
      ? MochaTestFrameworkBdd
      : selectedFramework === TestFrameworkName.MochaTDD
      ? MochaTestFrameworkTdd
      : JasmineTestFramework;
  }

  public getSpecLocator(): SpecLocator {
    return this.specLocator;
  }

  private createSpecLocator(): SpecLocator {
    this.logger.info(() => 'Loading test info from test files');

    const specLocatorOptions: SpecLocatorOptions = {
      ignore: [...this.config.excludeFiles],
      cwd: this.config.projectRootPath
    };

    const testFileParser: TestFileParser = new DefaultTestFileParser(
      this.testFramework.getTestInterface(),
      new SimpleLogger(this.logger, DefaultTestFileParser.name)
    );

    const fileHandler = new FileHandler(this.createLogger(FileHandler.name));

    return new SpecLocator(
      [...this.config.testFiles],
      testFileParser,
      fileHandler,
      new SimpleLogger(this.logger, SpecLocator.name),
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
    const testSuiteOrganizer = new TestSuiteOrganizer(this.createLogger(TestSuiteOrganizer.name));
    const testTreeProcessor = new TestTreeProcessor(this.createLogger(TestTreeProcessor.name));
    const testCountProcessor = new TestCountProcessor(testTreeProcessor, this.createLogger(TestCountProcessor.name));

    const suiteTestResultProcessor = new SuiteAggregateTestResultProcessor(
      testResultEventEmitter,
      testResolver,
      testCountProcessor,
      this.createLogger(SuiteAggregateTestResultProcessor.name)
    );

    const specLocator = this.getSpecLocator();

    const specToTestSuiteMapper = new SpecResponseToTestSuiteInfoMapper(
      specLocator,
      this.createLogger(SpecResponseToTestSuiteInfoMapper.name)
    );

    const testDiscoveryProcessor = new TestDiscoveryProcessor(
      specToTestSuiteMapper,
      testSuiteOrganizer,
      testCountProcessor,
      this.config.testGrouping,
      this.config.flattenSingleChildFolders,
      this.config.projectRootPath,
      this.config.testsBasePath,
      this.createLogger(TestDiscoveryProcessor.name)
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
      this.createLogger(KarmaTestEventProcessor.name)
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
      this.createLogger(`${KarmaTestEventProcessor.name}_Ambient`)
    );

    if (this.config.autoWatchEnabled && !this.testFramework.getTestCapabilities().autoWatch) {
      this.logger.warn(
        () =>
          `Auto-watch setting '${ConfigSetting.AutoWatchEnabled}' is set but is not supported ` +
          `for selected test framework '${this.testFramework.name}'`
      );
    }

    const watchModeTestEventProcessor =
      this.testFramework.getTestCapabilities().autoWatch && this.config.autoWatchEnabled
        ? new KarmaAutoWatchTestEventProcessor(
            ambientDelegateTestEventProcessor,
            testLoadEventEmitter,
            testRunEventEmitter,
            testResultEventEmitter,
            testRetireEventEmitter,
            testDiscoveryProcessor,
            this.createLogger(KarmaAutoWatchTestEventProcessor.name)
          )
        : undefined;

    const portManager = new PortAcquisitionManager(this.createLogger(PortAcquisitionManager.name));
    const karmaServerProcessLog: CommandLineProcessLog = new KarmaServerProcessLog(this.testServerLog);
    const prioritizedTestFactories: (Partial<TestFactory> & Disposable)[] = [];

    prioritizedTestFactories.push(
      new KarmaFactory(this.testFramework, this.config, karmaServerProcessLog, this.createLogger(KarmaFactory.name))
    );

    const isAngularProject = hasAngularProject(this.config.projectRootPath);
    this.logger.info(() => `Project detected as ${isAngularProject ? 'Angular' : 'non-Angular'} project`);

    if (isAngularProject) {
      prioritizedTestFactories.push(
        new AngularFactory(
          this.config,
          this.notifications,
          karmaServerProcessLog,
          this.createLogger(AngularFactory.name)
        )
      );
    }

    const karmaEventListener = new KarmaTestEventListener(
      testRunEventProcessor,
      watchModeTestEventProcessor,
      this.config.karmaReadyTimeout,
      this.notifications,
      this.createLogger(KarmaTestEventListener.name)
    );

    const testFactory: TestFactory = new CascadingTestFactory(
      prioritizedTestFactories,
      this.createLogger(CascadingTestFactory.name)
    );
    const testServerExecutor = testFactory.createTestServerExecutor();
    const testRunExecutor = testFactory.createTestRunExecutor();
    const testRunner = testFactory.createTestRunner(karmaEventListener, testDiscoveryProcessor, testRunExecutor);
    const testServer = testFactory.createTestServer(testServerExecutor);

    const testManager = new DefaultTestManager(
      testServer,
      testRunner,
      karmaEventListener,
      portManager,
      this.config.karmaPort,
      this.config.defaultSocketConnectionPort,
      this.notifications,
      this.createLogger(DefaultTestManager.name),
      this.config.defaultDebugPort
    );

    return testManager;
  }

  private createLogger(loggerName: string): SimpleLogger {
    return new SimpleLogger(this.logger, loggerName);
  }

  public async dispose(): Promise<void> {
    await Disposer.dispose(this.disposables);
  }
}
