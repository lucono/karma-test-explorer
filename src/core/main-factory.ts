import { EventEmitter } from 'vscode';
import { RetireEvent } from 'vscode-test-adapter-api';
import { TestFactory } from '../api/test-factory';
import { KARMA_SERVER_OUTPUT_CHANNEL_NAME } from '../constants';
import { AngularFactory, AngularFactoryConfig } from '../frameworks/angular/angular-factory';
import { AngularProject } from '../frameworks/angular/angular-project';
import { getDefaultAngularProject } from '../frameworks/angular/angular-util';
import { JasmineTestFramework } from '../frameworks/jasmine/jasmine-test-framework';
import { KarmaFactory, KarmaFactoryConfig } from '../frameworks/karma/karma-factory';
import { KarmaLogLevel } from '../frameworks/karma/karma-log-level';
import { DefaultTestBuilder, DefaultTestBuilderOptions } from '../frameworks/karma/runner/default-test-builder';
import { KarmaAutoWatchTestEventProcessor } from '../frameworks/karma/runner/karma-auto-watch-test-event-processor';
import { KarmaTestEventProcessor } from '../frameworks/karma/runner/karma-test-event-processor';
import { DebugStatusResolver, KarmaTestListener } from '../frameworks/karma/runner/karma-test-listener';
import { KarmaTestRunProcessor } from '../frameworks/karma/runner/karma-test-run-processor';
import { SuiteAggregateTestResultProcessor } from '../frameworks/karma/runner/suite-aggregate-test-result-processor';
import { TestBuilder } from '../frameworks/karma/runner/test-builder';
import { TestDiscoveryProcessor } from '../frameworks/karma/runner/test-discovery-processor';
import { KarmaServerProcessLog } from '../frameworks/karma/server/karma-server-process-log';
import { MochaTestFrameworkBdd, MochaTestFrameworkTdd } from '../frameworks/mocha/mocha-test-framework';
import { Disposable } from '../util/disposable/disposable';
import { Disposer } from '../util/disposable/disposer';
import { FileHandler } from '../util/file-handler';
import { LogAppender } from '../util/logging/log-appender';
import { SimpleLogger } from '../util/logging/simple-logger';
import { PortAcquisitionManager } from '../util/port-acquisition-manager';
import { CommandLineProcessLog } from '../util/process/command-line-process-log';
import { stripJsComments } from '../util/utils';
import { TestDefinitionProvider } from './base/test-definition-provider';
import { TestLoadEvent, TestResultEvent, TestRunEvent } from './base/test-events';
import { TestFramework } from './base/test-framework';
import { TestFrameworkName } from './base/test-framework-name';
import { TestResolver } from './base/test-resolver';
import { CascadingTestFactory } from './cascading-test-factory';
import { ExtensionConfig } from './config/extension-config';
import { Debugger } from './debugger';
import { DefaultTestManager } from './default-test-manager';
import { RegexTestDefinitionProvider } from './parser/regex-test-definition-provider';
import { RegexTestFileParser } from './parser/regex-test-file-parser';
import { TestHelper } from './test-helper';
import { TestLocator, TestLocatorOptions } from './test-locator';
import { TestSuiteOrganizer } from './util/test-suite-organizer';
import { TestTreeProcessor } from './util/test-tree-processor';
import { Notifications } from './vscode/notifications';
import { OutputChannelLog } from './vscode/output-channel-log';

export class MainFactory {
  private readonly disposables: Disposable[] = [];
  private readonly testFramework: TestFramework;
  private readonly angularProject?: AngularProject;
  private readonly fileHandler: FileHandler;
  private readonly testLocator: TestLocator;
  private readonly testHelper: TestHelper;
  private readonly debugger: Debugger;
  private readonly testServerLog: LogAppender;

  constructor(
    private readonly config: ExtensionConfig,
    private readonly notifications: Notifications,
    private readonly logger: SimpleLogger
  ) {
    this.disposables.push(logger);

    this.angularProject = getDefaultAngularProject(this.config.projectRootPath, this.config.defaultAngularProjectName);
    const karmaConfigPath = this.angularProject?.karmaConfigPath ?? this.config.userKarmaConfFilePath;

    this.logger.info(() => `Project detected as ${this.angularProject ? 'Angular' : 'plain Karma'} project`);

    this.fileHandler = new FileHandler(this.createLogger(FileHandler.name), {
      cwd: this.config.projectRootPath
    });

    this.testFramework = this.detectTestFramework(karmaConfigPath, this.fileHandler);
    this.logger.info(() => `Using test framework: ${this.testFramework.name}`);

    this.logger.debug(() => 'Creating test helper');
    this.testHelper = new TestHelper(this.createLogger(TestHelper.name), {
      showTestDefinitionTypeIndicators: this.config.showTestDefinitionTypeIndicators
    });
    this.disposables.push(this.testHelper);

    this.logger.debug(() => 'Creating test locator');
    this.testLocator = this.createTestLocator(this.fileHandler);
    this.disposables.push(this.testLocator);

    this.logger.debug(() => 'Creating debugger');
    this.debugger = new Debugger(this.createLogger(Debugger.name));
    this.disposables.push(this.debugger);

    this.testServerLog = new OutputChannelLog(KARMA_SERVER_OUTPUT_CHANNEL_NAME, {
      enabled: config.karmaLogLevel !== KarmaLogLevel.DISABLE
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
      this.logger.info(() => `Auto-watch is unavailable for the current test framework: ${this.testFramework.name}`);
    }

    const testSuiteOrganizer = new TestSuiteOrganizer(
      this.config.projectRootPath,
      this.config.testsBasePath,
      this.testHelper,
      this.createLogger(TestSuiteOrganizer.name)
    );

    const testTreeProcessor = new TestTreeProcessor(this.createLogger(TestTreeProcessor.name));
    const testLocator = this.getTestLocator();

    const testBuilderOptions: DefaultTestBuilderOptions = {
      excludeDisabledTests: this.config.excludeDisabledTests,
      showOnlyFocusedTests: this.config.showOnlyFocusedTests,
      showUnmappedTests: this.config.showUnmappedTests
    };

    const testBuilder = new DefaultTestBuilder(
      testLocator,
      this.testHelper,
      this.createLogger(DefaultTestBuilder.name),
      testBuilderOptions
    );

    const testDiscoveryProcessor = new TestDiscoveryProcessor(
      testBuilder,
      testSuiteOrganizer,
      testTreeProcessor,
      this.config.testGrouping,
      this.config.flattenSingleChildFolders,
      this.notifications,
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
      testTreeProcessor,
      testBuilder,
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

  public getTestLocator(): TestLocator {
    return this.testLocator;
  }

  public getDebugger(): Debugger {
    return this.debugger;
  }

  private createTestLocator(fileHandler: FileHandler): TestLocator {
    this.logger.info(() => 'Loading test info from test files');

    const testLocatorOptions: TestLocatorOptions = {
      ignore: [...this.config.excludeFiles],
      cwd: this.config.projectRootPath,
      extglob: true
    };

    const testDefinitionProvider = this.createTestDefinitionProvider();

    return new TestLocator(
      [...this.config.testFiles],
      testDefinitionProvider,
      fileHandler,
      new SimpleLogger(this.logger, TestLocator.name),
      testLocatorOptions
    );
  }

  private createTestDefinitionProvider(): TestDefinitionProvider {
    const testFileParser: RegexTestFileParser = new RegexTestFileParser(
      this.testFramework.getTestInterface(),
      new SimpleLogger(this.logger, RegexTestFileParser.name)
    );

    const testDefinitionProvider: TestDefinitionProvider = new RegexTestDefinitionProvider(
      testFileParser,
      this.createLogger(RegexTestDefinitionProvider.name)
    );

    return testDefinitionProvider;
  }

  private createKarmaFactory(serverProcessLog: CommandLineProcessLog, watchModeEnabled: boolean): KarmaFactory {
    const karmaFactoryConfig: KarmaFactoryConfig = {
      projectRootPath: this.config.projectRootPath,
      baseKarmaConfFilePath: this.config.baseKarmaConfFilePath,
      userKarmaConfFilePath: this.config.userKarmaConfFilePath,
      autoWatchEnabled: watchModeEnabled,
      autoWatchBatchDelay: this.config.autoWatchBatchDelay,
      karmaLogLevel: this.config.karmaLogLevel,
      karmaReporterLogLevel: this.config.karmaReporterLogLevel,
      customLauncher: this.config.customLauncher,
      environment: this.config.environment,
      browser: this.config.browser,
      karmaProcessCommand: this.config.karmaProcessCommand,
      testTriggerMethod: this.config.testTriggerMethod,
      failOnStandardError: this.config.failOnStandardError,
      allowGlobalPackageFallback: this.config.allowGlobalPackageFallback
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
      karmaReporterLogLevel: this.config.karmaReporterLogLevel,
      customLauncher: this.config.customLauncher,
      environment: this.config.environment,
      browser: this.config.browser,
      angularProcessCommand: this.config.angularProcessCommand,
      defaultAngularProjectName: this.config.defaultAngularProjectName,
      failOnStandardError: this.config.failOnStandardError,
      allowGlobalPackageFallback: this.config.allowGlobalPackageFallback
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
    testTreeProcessor: TestTreeProcessor,
    testBuilder: TestBuilder,
    testSuiteOrganizer: TestSuiteOrganizer,
    testDiscoveryProcessor: TestDiscoveryProcessor,
    autoWatchEnabled: boolean
  ): KarmaTestListener {
    const suiteTestResultProcessor = new SuiteAggregateTestResultProcessor(
      testResultEventEmitter,
      testResolver,
      testTreeProcessor,
      this.createLogger(SuiteAggregateTestResultProcessor.name)
    );

    const testRunEventProcessor = new KarmaTestEventProcessor(
      testResultEventEmitter,
      testBuilder,
      testSuiteOrganizer,
      suiteTestResultProcessor,
      this.testLocator,
      this.config.testGrouping,
      testResolver,
      this.fileHandler,
      this.testHelper,
      this.createLogger(KarmaTestEventProcessor.name)
    );

    let watchModeTestEventProcessor: KarmaAutoWatchTestEventProcessor | undefined;

    if (autoWatchEnabled) {
      const ambientDelegateTestEventProcessor = new KarmaTestEventProcessor(
        testResultEventEmitter,
        testBuilder,
        testSuiteOrganizer,
        suiteTestResultProcessor,
        this.testLocator,
        this.config.testGrouping,
        testResolver,
        this.fileHandler,
        this.testHelper,
        this.createLogger(`${KarmaAutoWatchTestEventProcessor.name}:${KarmaTestEventProcessor.name}`)
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

    const testRunProcessor = new KarmaTestRunProcessor(
      testRunEventProcessor,
      watchModeTestEventProcessor,
      this.notifications,
      new SimpleLogger(this.logger, KarmaTestRunProcessor.name)
    );

    const debugStatusResolver: DebugStatusResolver = {
      isDebugging: () => this.debugger.isDebugging()
    };

    return new KarmaTestListener(testRunProcessor, debugStatusResolver, this.createLogger(KarmaTestListener.name), {
      karmaReadyTimeout: this.config.karmaReadyTimeout
    });
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
