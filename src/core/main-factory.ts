import { EventEmitter } from 'vscode';
import { RetireEvent } from 'vscode-test-adapter-api';
import { TestFactory } from '../api/test-factory';
import { KARMA_SERVER_OUTPUT_CHANNEL_NAME } from '../constants';
import { AngularFactory, AngularFactoryConfig } from '../frameworks/angular/angular-factory';
import { AngularProject } from '../frameworks/angular/angular-project';
import { getDefaultAngularProject } from '../frameworks/angular/angular-util';
import { JasmineTestFramework } from '../frameworks/jasmine/jasmine-test-framework';
import { KarmaFactory, KarmaFactoryConfig } from '../frameworks/karma/karma-factory';
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
import { stripJsComments } from '../util/utils';
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
  private readonly angularProject?: AngularProject;
  private readonly specLocator: SpecLocator;
  private readonly testServerLog: LogAppender;

  constructor(
    private readonly config: ExtensionConfig,
    private readonly notifications: Notifications,
    private readonly logger: SimpleLogger
  ) {
    this.disposables.push(logger);

    this.angularProject = getDefaultAngularProject(this.config.projectRootPath, this.config.defaultAngularProjectName);
    this.logger.info(() => `Project detected as ${this.angularProject ? 'Angular' : 'non-Angular'} project`);

    const fileHandler = new FileHandler(this.createLogger(FileHandler.name));
    const karmaConfigPath = this.angularProject?.karmaConfigPath ?? this.config.userKarmaConfFilePath;

    this.testFramework = this.detectTestFramework(karmaConfigPath, fileHandler);
    this.logger.info(() => `Using test framework: ${this.testFramework.name}`);

    this.specLocator = this.createSpecLocator(fileHandler);
    this.disposables.push(this.specLocator);

    this.testServerLog = new OutputChannelLog(KARMA_SERVER_OUTPUT_CHANNEL_NAME, {
      enabled: config.karmaLogLevel !== LogLevel[LogLevel.DISABLE]
    });
    this.disposables.push(this.testServerLog);
  }

  public createTestManager(
    testLoadEventEmitter: EventEmitter<TestLoadEvent>,
    testRunEventEmitter: EventEmitter<TestRunEvent>,
    testResultEventEmitter: EventEmitter<TestResultEvent>,
    testRetireEventEmitter: EventEmitter<RetireEvent>,
    testResolver: TestResolver
  ): DefaultTestManager {
    const watchModeSupported = !!this.testFramework.getTestCapabilities().watchModeSupport;
    const watchModeRequested = this.config.autoWatchEnabled;
    const watchModeEnabled = watchModeRequested && watchModeSupported;

    if (watchModeRequested && !watchModeSupported) {
      this.logger.warn(
        () =>
          `Auto-watch setting '${ConfigSetting.AutoWatchEnabled}' is enabled but not supported ` +
          `for the current test framework '${this.testFramework.name}'`
      );
    }

    const testSuiteOrganizer = new TestSuiteOrganizer(this.createLogger(TestSuiteOrganizer.name));
    const testTreeProcessor = new TestTreeProcessor(this.createLogger(TestTreeProcessor.name));
    const testCountProcessor = new TestCountProcessor(testTreeProcessor, this.createLogger(TestCountProcessor.name));

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

    const portManager = new PortAcquisitionManager(this.createLogger(PortAcquisitionManager.name));
    const testServerProcessLog: CommandLineProcessLog = new KarmaServerProcessLog(this.testServerLog);

    const prioritizedTestFactories: (Partial<TestFactory> & Disposable)[] = [];
    prioritizedTestFactories.push(this.createKarmaFactory(testServerProcessLog, watchModeEnabled));

    if (this.angularProject) {
      prioritizedTestFactories.push(
        this.createAngularFactory(this.angularProject, testServerProcessLog, watchModeEnabled)
      );
    }

    const karmaEventListener = this.createKarmaTestEventListener(
      testLoadEventEmitter,
      testRunEventEmitter,
      testResultEventEmitter,
      testRetireEventEmitter,
      testResolver,
      testCountProcessor,
      specToTestSuiteMapper,
      testSuiteOrganizer,
      testDiscoveryProcessor,
      watchModeEnabled
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

  public getTestFramework(): TestFramework {
    return this.testFramework;
  }

  public getSpecLocator(): SpecLocator {
    return this.specLocator;
  }

  private createSpecLocator(fileHandler: FileHandler): SpecLocator {
    this.logger.info(() => 'Loading test info from test files');

    const specLocatorOptions: SpecLocatorOptions = {
      ignore: [...this.config.excludeFiles],
      cwd: this.config.projectRootPath
    };

    const testFileParser: TestFileParser = new DefaultTestFileParser(
      this.testFramework.getTestInterface(),
      new SimpleLogger(this.logger, DefaultTestFileParser.name)
    );

    return new SpecLocator(
      [...this.config.testFiles],
      testFileParser,
      fileHandler,
      new SimpleLogger(this.logger, SpecLocator.name),
      specLocatorOptions
    );
  }

  private createKarmaFactory(serverProcessLog: CommandLineProcessLog, watchModeEnabled: boolean): KarmaFactory {
    const karmaFactoryConfig: KarmaFactoryConfig = {
      projectRootPath: this.config.projectRootPath,
      baseKarmaConfFilePath: this.config.baseKarmaConfFilePath,
      userKarmaConfFilePath: this.config.userKarmaConfFilePath,
      autoWatchEnabled: watchModeEnabled,
      autoWatchBatchDelay: this.config.autoWatchBatchDelay,
      karmaLogLevel: this.config.karmaLogLevel,
      customLauncher: this.config.customLauncher,
      environment: this.config.environment,
      browser: this.config.browser,
      karmaProcessCommand: this.config.karmaProcessCommand,
      testTriggerMethod: this.config.testTriggerMethod,
      failOnStandardError: this.config.failOnStandardError
    };

    return new KarmaFactory(
      this.testFramework,
      karmaFactoryConfig,
      serverProcessLog,
      this.createLogger(KarmaFactory.name)
    );
  }

  private createAngularFactory(
    angularProject: AngularProject,
    serverProcessLog: CommandLineProcessLog,
    watchModeEnabled: boolean
  ): AngularFactory {
    const angularFactoryConfig: AngularFactoryConfig = {
      projectRootPath: this.config.projectRootPath,
      baseKarmaConfFilePath: this.config.baseKarmaConfFilePath,
      autoWatchEnabled: watchModeEnabled,
      autoWatchBatchDelay: this.config.autoWatchBatchDelay,
      karmaLogLevel: this.config.karmaLogLevel,
      customLauncher: this.config.customLauncher,
      environment: this.config.environment,
      browser: this.config.browser,
      angularProcessCommand: this.config.angularProcessCommand,
      defaultAngularProjectName: this.config.defaultAngularProjectName,
      failOnStandardError: this.config.failOnStandardError
    };

    return new AngularFactory(
      angularFactoryConfig,
      angularProject,
      serverProcessLog,
      this.createLogger(AngularFactory.name)
    );
  }

  private createKarmaTestEventListener(
    testLoadEventEmitter: EventEmitter<TestLoadEvent>,
    testRunEventEmitter: EventEmitter<TestRunEvent>,
    testResultEventEmitter: EventEmitter<TestResultEvent>,
    testRetireEventEmitter: EventEmitter<RetireEvent>,
    testResolver: TestResolver,
    testCountProcessor: TestCountProcessor,
    specToTestSuiteMapper: SpecResponseToTestSuiteInfoMapper,
    testSuiteOrganizer: TestSuiteOrganizer,
    testDiscoveryProcessor: TestDiscoveryProcessor,
    autoWatchEnabled: boolean
  ): KarmaTestEventListener {
    const suiteTestResultProcessor = new SuiteAggregateTestResultProcessor(
      testResultEventEmitter,
      testResolver,
      testCountProcessor,
      this.createLogger(SuiteAggregateTestResultProcessor.name)
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

    let watchModeTestEventProcessor: KarmaAutoWatchTestEventProcessor | undefined;

    if (autoWatchEnabled) {
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

      watchModeTestEventProcessor = new KarmaAutoWatchTestEventProcessor(
        ambientDelegateTestEventProcessor,
        testLoadEventEmitter,
        testRunEventEmitter,
        testResultEventEmitter,
        testRetireEventEmitter,
        testDiscoveryProcessor,
        this.createLogger(KarmaAutoWatchTestEventProcessor.name)
      );
    }

    return new KarmaTestEventListener(
      testRunEventProcessor,
      watchModeTestEventProcessor,
      this.config.karmaReadyTimeout,
      this.notifications,
      this.createLogger(KarmaTestEventListener.name)
    );
  }

  private detectTestFramework(karmaConfigPath: string, fileHandler: FileHandler): TestFramework {
    const specifiedTestFramework = this.config.testFramework;

    this.logger.debug(() => `Configured test framework: ${specifiedTestFramework ?? '<none>'}`);

    let testFramework: TestFramework | undefined =
      specifiedTestFramework === TestFrameworkName.MochaBDD
        ? MochaTestFrameworkBdd
        : specifiedTestFramework === TestFrameworkName.MochaTDD
        ? MochaTestFrameworkTdd
        : undefined;

    if (testFramework) {
      this.logger.debug(() => `Selecting user-configured test framework: ${testFramework?.name}`);
      return testFramework;
    }

    this.logger.debug(() => `Detecting test framework from karma config file: ${karmaConfigPath}`);

    const rawConfigContent = fileHandler.readFileSync(karmaConfigPath);
    const configContent = rawConfigContent ? stripJsComments(rawConfigContent).replace(/ /g, '') : undefined;

    if (configContent) {
      const matchResult = /frameworks:\[[^\]]*['"]((jasmine)|(mocha))['"][^\]]*\]/g.exec(
        stripJsComments(configContent).replace(/ /g, '')
      );

      const isJasmineConfigured = matchResult?.[2];
      const isMochaConfigured = matchResult?.[3];

      testFramework = isJasmineConfigured
        ? JasmineTestFramework
        : isMochaConfigured
        ? MochaTestFrameworkBdd
        : undefined;

      if (testFramework) {
        this.logger.debug(() => `Selecting detected test framework: ${testFramework?.name}`);
        return testFramework;
      }
    }

    testFramework = JasmineTestFramework;

    this.logger.warn(
      () =>
        `Failed to detect test framework from karma config file: ${karmaConfigPath}. ` +
        `Falling back to test framework: ${testFramework}`
    );

    return testFramework;
  }

  private createLogger(loggerName: string): SimpleLogger {
    return new SimpleLogger(this.logger, loggerName);
  }

  public async dispose(): Promise<void> {
    await Disposer.dispose(this.disposables);
  }
}
