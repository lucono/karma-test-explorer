import { EventEmitter, WorkspaceFolder } from 'vscode';
import { RetireEvent } from 'vscode-test-adapter-api';
import { TestFactory } from '../api/test-factory';
import { KARMA_SERVER_OUTPUT_CHANNEL_NAME, KARMA_TEST_EVENT_INTERVAL_TIMEOUT } from '../constants';
import { AngularFactory, AngularFactoryConfig } from '../frameworks/angular/angular-factory';
import { AngularProject } from '../frameworks/angular/angular-project';
import { getDefaultAngularProject } from '../frameworks/angular/angular-util';
import { JasmineTestFramework } from '../frameworks/jasmine/jasmine-test-framework';
import { KarmaFactory, KarmaFactoryConfig } from '../frameworks/karma/karma-factory';
import { KarmaLogLevel } from '../frameworks/karma/karma-log-level';
import { DefaultTestBuilder, DefaultTestBuilderOptions } from '../frameworks/karma/runner/default-test-builder';
import { KarmaAutoWatchTestEventProcessor } from '../frameworks/karma/runner/karma-auto-watch-test-event-processor';
import {
  KarmaTestEventProcessor,
  TestEventProcessingOptions
} from '../frameworks/karma/runner/karma-test-event-processor';
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
import { PortAcquisitionClient } from '../util/port/port-acquisition-client';
import { ProcessHandler } from '../util/process/process-handler';
import { ProcessLog } from '../util/process/process-log';
import { stripJsComments } from '../util/utils';
import { ProjectType } from './base/project-type';
import { TestDefinitionProvider } from './base/test-definition-provider';
import { TestLoadEvent, TestResultEvent, TestRunEvent } from './base/test-events';
import { TestFramework } from './base/test-framework';
import { TestFrameworkName } from './base/test-framework-name';
import { TestStatus } from './base/test-status';
import { CascadingTestFactory } from './cascading-test-factory';
import { ExtensionConfig } from './config/extension-config';
import { Debugger } from './debugger';
import { DefaultTestManager } from './default-test-manager';
import { FileWatcher, FileWatcherOptions } from './file-watcher';
import { RegexTestDefinitionProvider } from './parser/regex-test-definition-provider';
import { RegexTestFileParser } from './parser/regex-test-file-parser';
import { TestHelper } from './test-helper';
import { TestLocator, TestLocatorOptions } from './test-locator';
import { StoredTestResolver, TestStore } from './test-store';
import { TestSuiteOrganizer, TestSuiteOrganizerOptions } from './util/test-suite-organizer';
import { TestTreeProcessor } from './util/test-tree-processor';
import { Commands } from './vscode/commands/commands';
import { ProjectCommand } from './vscode/commands/project-command';
import { NotificationHandler } from './vscode/notifications/notification-handler';
import { OutputChannelLog } from './vscode/output-channel-log';

export class MainFactory {
  private readonly disposables: Disposable[] = [];
  private readonly testFramework: TestFramework;
  private readonly angularProject?: AngularProject;
  private readonly processHandler: ProcessHandler;
  private readonly fileHandler: FileHandler;
  private readonly testLocator: TestLocator;
  private readonly testHelper: TestHelper;
  private readonly testStore: TestStore;
  private readonly testServerLog: LogAppender;

  constructor(
    private readonly workspaceFolder: WorkspaceFolder,
    private readonly projectDisplayName: string,
    private readonly projectNameSpace: string | undefined,
    private readonly config: ExtensionConfig,
    private readonly testDebugger: Debugger,
    private readonly portAcquisitionClient: PortAcquisitionClient,
    private readonly projectCommands: Commands<ProjectCommand>,
    private readonly notificationHandler: NotificationHandler,
    private readonly testLoadEventEmitter: EventEmitter<TestLoadEvent>,
    private readonly testRunEventEmitter: EventEmitter<TestRunEvent>,
    private readonly testResultEventEmitter: EventEmitter<TestResultEvent>,
    private readonly testRetireEventEmitter: EventEmitter<RetireEvent>,
    private readonly logger: SimpleLogger
  ) {
    this.disposables.push(logger);

    this.angularProject =
      config.projectType !== ProjectType.Karma
        ? getDefaultAngularProject(this.config.projectRootPath, this.config.selectedAngularProject)
        : undefined;

    this.fileHandler = new FileHandler(this.createLogger(FileHandler.name), {
      cwd: this.config.projectRootPath
    });
    const karmaConfigPath = this.angularProject?.karmaConfigPath ?? this.config.userKarmaConfFilePath;

    const configuredTestFramework: TestFramework | undefined =
      this.config.testFramework === TestFrameworkName.MochaBDD
        ? MochaTestFrameworkBdd
        : this.config.testFramework === TestFrameworkName.MochaTDD
        ? MochaTestFrameworkTdd
        : this.config.testFramework === TestFrameworkName.Jasmine
        ? JasmineTestFramework
        : undefined;

    this.testFramework = configuredTestFramework ?? this.detectTestFramework(karmaConfigPath, this.fileHandler);

    this.logger.info(
      () => `Using test framework: ${this.testFramework.name} ${!config.testFramework ? `(auto-detected)` : ''}`
    );

    this.logger.debug(() => 'Creating test helper');
    this.testHelper = new TestHelper(this.createLogger(TestHelper.name), {
      showTestDefinitionTypeIndicators: this.config.showTestDefinitionTypeIndicators
    });
    this.disposables.push(this.testHelper);

    this.logger.debug(() => 'Creating process handler');
    this.processHandler = new ProcessHandler(this.createLogger(ProcessHandler.name));
    this.disposables.push(this.processHandler);

    this.logger.debug(() => 'Creating test locator');
    this.testLocator = this.createTestLocator(this.fileHandler);
    this.disposables.push(this.testLocator);

    this.logger.debug(() => 'Creating test store');
    this.testStore = new TestStore(this.createLogger(TestStore.name));
    this.disposables.push(this.testStore);

    const outputChannelNamespaceLabel = this.projectNameSpace ? ` (${this.projectNameSpace})` : '';

    this.testServerLog = new OutputChannelLog(`${KARMA_SERVER_OUTPUT_CHANNEL_NAME}${outputChannelNamespaceLabel}`, {
      enabled: config.karmaLogLevel !== KarmaLogLevel.DISABLE
    });
    this.disposables.push(this.testServerLog);
  }

  public createFileWatcher(): FileWatcher {
    const reloadTriggerFiles = [...this.config.reloadOnChangedFiles];

    if (this.config.reloadOnKarmaConfigChange) {
      reloadTriggerFiles.push(this.config.userKarmaConfFilePath);
    }
    if (this.config.envFile) {
      reloadTriggerFiles.push(this.config.envFile);
    }

    const fileWatcherOptions: FileWatcherOptions = {
      retireTestsInChangedFiles: !this.isAutoWatchActive()
    };

    const fileWatcher = new FileWatcher(
      this.workspaceFolder,
      this.config.projectRootPath,
      this.config.testFiles,
      reloadTriggerFiles,
      this.getTestLocator(),
      this.testStore,
      this.testRetireEventEmitter,
      this.projectCommands,
      this.createLogger(FileWatcher.name),
      fileWatcherOptions
    );

    return fileWatcher;
  }

  public createTestManager(): DefaultTestManager {
    const watchModeSupported = !!this.testFramework.getTestCapabilities().watchModeSupport;
    const watchModeRequested = this.config.autoWatchEnabled;
    const watchModeEnabled = watchModeRequested && watchModeSupported;

    if (watchModeRequested && !watchModeSupported) {
      this.logger.info(() => `Auto-watch is unavailable for the current test framework: ${this.testFramework.name}`);
    }

    const testSuiteOrganizerOptions: TestSuiteOrganizerOptions = {
      testGrouping: this.config.testGrouping,
      flattenSingleChildFolders: this.config.flattenSingleChildFolders,
      rootSuiteLabel: this.projectNameSpace
        ? this.projectDisplayName
        : this.angularProject
        ? 'Angular Tests'
        : 'Karma Tests'
    };

    const testSuiteOrganizer = new TestSuiteOrganizer(
      this.config.projectRootPath,
      this.config.testsBasePath ?? this.config.projectSubFolderPath,
      this.testHelper,
      this.createLogger(TestSuiteOrganizer.name),
      testSuiteOrganizerOptions
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
      this.notificationHandler,
      this.createLogger(TestDiscoveryProcessor.name)
    );

    const testServerProcessLog: ProcessLog = new KarmaServerProcessLog(this.testServerLog);

    const prioritizedTestFactories: (Partial<TestFactory> & Disposable)[] = [];
    prioritizedTestFactories.push(this.createKarmaFactory(testServerProcessLog, watchModeEnabled));

    if (this.angularProject) {
      prioritizedTestFactories.push(
        this.createAngularFactory(this.angularProject, testServerProcessLog, watchModeEnabled)
      );
    }

    const karmaEventListener = this.createKarmaTestEventListener(
      this.testLoadEventEmitter,
      this.testRunEventEmitter,
      this.testResultEventEmitter,
      this.testRetireEventEmitter,
      this.testStore.getTestResolver(),
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
      this.portAcquisitionClient,
      this.config.karmaPort,
      this.config.defaultSocketConnectionPort,
      this.projectCommands,
      this.notificationHandler,
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

  public getTestStore(): TestStore {
    return this.testStore;
  }

  public getProcessHandler(): ProcessHandler {
    return this.processHandler;
  }

  // public getDebugger(): Debugger {
  //   return this.debugger;
  // }

  private createTestLocator(fileHandler: FileHandler): TestLocator {
    const testLocatorOptions: TestLocatorOptions = {
      ignore: [...this.config.excludeFiles],
      cwd: this.config.projectRootPath
    };

    const testDefinitionProvider = this.createTestDefinitionProvider();

    return new TestLocator(
      this.config.projectSubFolderPath,
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

  private createKarmaFactory(serverProcessLog: ProcessLog, watchModeEnabled: boolean): KarmaFactory {
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
      this.processHandler,
      serverProcessLog,
      this.createLogger(KarmaFactory.name)
    );
  }

  private createAngularFactory(
    angularProject: AngularProject,
    serverProcessLog: ProcessLog,
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
      failOnStandardError: this.config.failOnStandardError,
      allowGlobalPackageFallback: this.config.allowGlobalPackageFallback
    };

    return new AngularFactory(
      angularFactoryConfig,
      angularProject,
      this.processHandler,
      serverProcessLog,
      this.createLogger(AngularFactory.name)
    );
  }

  private createKarmaTestEventListener(
    testLoadEventEmitter: EventEmitter<TestLoadEvent>,
    testRunEventEmitter: EventEmitter<TestRunEvent>,
    testResultEventEmitter: EventEmitter<TestResultEvent>,
    testRetireEventEmitter: EventEmitter<RetireEvent>,
    testResolver: StoredTestResolver,
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
      testRetireEventEmitter,
      testBuilder,
      testSuiteOrganizer,
      suiteTestResultProcessor,
      this.testLocator,
      testResolver,
      this.fileHandler,
      this.testHelper,
      this.createLogger(KarmaTestEventProcessor.name)
    );

    let watchModeTestEventProcessor: KarmaAutoWatchTestEventProcessor | undefined;

    if (autoWatchEnabled) {
      const ambientDelegateTestEventProcessor = new KarmaTestEventProcessor(
        testResultEventEmitter,
        testRetireEventEmitter,
        testBuilder,
        testSuiteOrganizer,
        suiteTestResultProcessor,
        this.testLocator,
        testResolver,
        this.fileHandler,
        this.testHelper,
        this.createLogger(`${KarmaAutoWatchTestEventProcessor.name}::${KarmaTestEventProcessor.name}`)
      );

      watchModeTestEventProcessor = new KarmaAutoWatchTestEventProcessor(
        ambientDelegateTestEventProcessor,
        testLoadEventEmitter,
        testRunEventEmitter,
        testResultEventEmitter,
        testRetireEventEmitter,
        testDiscoveryProcessor,
        this.testStore,
        this.createLogger(KarmaAutoWatchTestEventProcessor.name)
      );
    }

    const testDiscoveryEventProcessingOptions: TestEventProcessingOptions = {
      emitTestEvents: [],
      filterTestEvents: [],
      emitTestStats: false,
      retireExcludedTests: false,
      testEventIntervalTimeout: KARMA_TEST_EVENT_INTERVAL_TIMEOUT
    };

    const foregroundOnlyLastExecutedTests = this.isAutoWatchActive();

    const testRunEventProcessingOptions: TestEventProcessingOptions = {
      emitTestEvents: Object.values(TestStatus),
      filterTestEvents: [],
      emitTestStats: true,
      retireExcludedTests: foregroundOnlyLastExecutedTests,
      testEventIntervalTimeout: KARMA_TEST_EVENT_INTERVAL_TIMEOUT
    };

    const debugStatusResolver: DebugStatusResolver = {
      isDebugging: () => this.testDebugger.isDebugging()
    };

    const testRunProcessor = new KarmaTestRunProcessor(
      testRunEventProcessor,
      watchModeTestEventProcessor,
      this.notificationHandler,
      debugStatusResolver,
      testDiscoveryEventProcessingOptions,
      testRunEventProcessingOptions,
      new SimpleLogger(this.logger, KarmaTestRunProcessor.name)
    );

    return new KarmaTestListener(testRunProcessor, this.createLogger(KarmaTestListener.name), {
      karmaReadyTimeout: this.config.karmaReadyTimeout
    });
  }

  private getFrameworksFromKarmaConfig(karmaConfigPath: string, fileHandler: FileHandler): string[] {
    const rawConfigContent = fileHandler.readFileSync(karmaConfigPath);
    const configContent = rawConfigContent ? stripJsComments(rawConfigContent).replace(/\s/g, '') : undefined;

    const matchResult = configContent ? /frameworks:\[([^\]]*)\]/g.exec(configContent)?.[1] : '';
    const frameworkList = matchResult?.split(',').map(entry => entry.replace(/(^['"`]|['"`]$)/g, '')) ?? [];

    this.logger.debug(() => `Detected frameworks from karma config: ${frameworkList.join(', ')}`);
    return frameworkList;
  }

  private detectTestFramework(karmaConfigPath: string, fileHandler: FileHandler): TestFramework {
    this.logger.debug(() => `Detecting test framework from karma config file: ${karmaConfigPath}`);

    const configuredKarmaFrameworks = this.getFrameworksFromKarmaConfig(karmaConfigPath, fileHandler);
    const isJasmineConfigured = configuredKarmaFrameworks.includes('jasmine');
    const isMochaConfigured = configuredKarmaFrameworks.includes('mocha');

    let testFramework = isJasmineConfigured
      ? JasmineTestFramework
      : isMochaConfigured
      ? MochaTestFrameworkBdd
      : undefined;

    if (testFramework) {
      this.logger.debug(() => `Detected test framework: ${testFramework?.name}`);
    } else {
      testFramework = JasmineTestFramework;

      this.logger.warn(
        () =>
          `Failed to detect test framework from karma config file: ${karmaConfigPath}. ` +
          `Falling back to test framework: ${testFramework}`
      );
    }

    return testFramework;
  }

  private isAutoWatchActive(): boolean {
    return (this.testFramework.getTestCapabilities().watchModeSupport ?? false) && this.config.autoWatchEnabled;
  }

  private createLogger(loggerName: string): SimpleLogger {
    return new SimpleLogger(this.logger, loggerName);
  }

  public async dispose(): Promise<void> {
    await Disposer.dispose(this.disposables);
  }
}
