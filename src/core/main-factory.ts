import { EventEmitter, WorkspaceFolder } from 'vscode';
import { RetireEvent } from 'vscode-test-adapter-api';

import { TestFactory } from '../api/test-factory.js';
import { KARMA_TEST_EVENT_INTERVAL_TIMEOUT } from '../constants.js';
import { AngularFactory, AngularFactoryConfig } from '../frameworks/angular/angular-factory.js';
import { JasmineTestFramework } from '../frameworks/jasmine/jasmine-test-framework.js';
import { KarmaFactory, KarmaFactoryConfig } from '../frameworks/karma/karma-factory.js';
import { DefaultTestBuilder, DefaultTestBuilderOptions } from '../frameworks/karma/runner/default-test-builder.js';
import { KarmaAutoWatchTestEventProcessor } from '../frameworks/karma/runner/karma-auto-watch-test-event-processor.js';
import {
  KarmaTestEventProcessor,
  TestEventProcessingOptions
} from '../frameworks/karma/runner/karma-test-event-processor.js';
import { DebugStatusResolver, KarmaTestListener } from '../frameworks/karma/runner/karma-test-listener.js';
import { KarmaTestRunProcessor } from '../frameworks/karma/runner/karma-test-run-processor.js';
import { SuiteAggregateTestResultProcessor } from '../frameworks/karma/runner/suite-aggregate-test-result-processor.js';
import { TestBuilder } from '../frameworks/karma/runner/test-builder.js';
import { TestDiscoveryProcessor } from '../frameworks/karma/runner/test-discovery-processor.js';
import { KarmaServerProcessLog } from '../frameworks/karma/server/karma-server-process-log.js';
import { MochaTestFrameworkBdd, MochaTestFrameworkTdd } from '../frameworks/mocha/mocha-test-framework.js';
import { Disposable } from '../util/disposable/disposable.js';
import { Disposer } from '../util/disposable/disposer.js';
import { FileHandler } from '../util/filesystem/file-handler.js';
import { LogAppender } from '../util/logging/log-appender.js';
import { SimpleLogger } from '../util/logging/simple-logger.js';
import { PortAcquisitionClient } from '../util/port/port-acquisition-client.js';
import { ProcessHandler } from '../util/process/process-handler.js';
import { ProcessLog } from '../util/process/process-log.js';
import { stripJsComments } from '../util/utils.js';
import { ProjectType } from './base/project-type.js';
import { TestDefinitionProvider } from './base/test-definition-provider.js';
import { TestLoadEvent, TestResultEvent, TestRunEvent } from './base/test-events.js';
import { TestFrameworkName } from './base/test-framework-name.js';
import { TestFramework } from './base/test-framework.js';
import { TestStatus } from './base/test-status.js';
import { CascadingTestFactory } from './cascading-test-factory.js';
import { ExtensionConfig, TestParsingMethod } from './config/extension-config.js';
import { Debugger } from './debugger.js';
import { DefaultTestManager } from './default-test-manager.js';
import { FileWatcher, FileWatcherOptions } from './file-watcher.js';
import { AstTestDefinitionProvider } from './parser/ast/ast-test-definition-provider.js';
import { AstTestFileParser } from './parser/ast/ast-test-file-parser.js';
import { ForEachNodeProcessor } from './parser/ast/processors/for-each-node-processor.js';
import { FunctionCallNodeProcessor } from './parser/ast/processors/function-call-node-processor.js';
import { FunctionDeclarationNodeProcessor } from './parser/ast/processors/function-declaration-node-processor.js';
import { IfElseNodeProcessor } from './parser/ast/processors/if-else-node-processor.js';
import { LoopNodeProcessor } from './parser/ast/processors/loop-node-processor.js';
import { TestAndSuiteNodeProcessor } from './parser/ast/processors/test-and-suite-node-processor.js';
import { TestDescriptionNodeProcessor } from './parser/ast/processors/test-description-node-processor.js';
import { ProcessedSourceNode, SourceNodeProcessor } from './parser/ast/source-node-processor.js';
import { RegexpTestDefinitionProvider } from './parser/regexp/regexp-test-definition-provider.js';
import { RegexpTestFileParser } from './parser/regexp/regexp-test-file-parser.js';
import { TestHelper } from './test-helper.js';
import { TestLocator, TestLocatorOptions } from './test-locator.js';
import { StoredTestResolver, TestStore } from './test-store.js';
import { TestSuiteOrganizer, TestSuiteOrganizerOptions } from './util/test-suite-organizer.js';
import { TestTreeProcessor } from './util/test-tree-processor.js';
import { Commands } from './vscode/commands/commands.js';
import { ProjectCommand } from './vscode/commands/project-command.js';
import { NotificationHandler } from './vscode/notifications/notification-handler.js';

export class MainFactory {
  private readonly disposables: Disposable[] = [];
  private readonly testFramework: TestFramework;
  private readonly processHandler: ProcessHandler;
  private readonly testLocator: TestLocator;
  private readonly testHelper: TestHelper;
  private readonly testStore: TestStore;

  constructor(
    private readonly workspaceFolder: WorkspaceFolder,
    private readonly projectShortName: string,
    private readonly projectNameSpace: string | undefined,
    private readonly config: ExtensionConfig,
    private readonly testDebugger: Debugger,
    private readonly portAcquisitionClient: PortAcquisitionClient,
    private readonly fileHandler: FileHandler,
    private readonly projectCommands: Commands<ProjectCommand>,
    private readonly notificationHandler: NotificationHandler,
    private readonly testLoadEventEmitter: EventEmitter<TestLoadEvent>,
    private readonly testRunEventEmitter: EventEmitter<TestRunEvent>,
    private readonly testResultEventEmitter: EventEmitter<TestResultEvent>,
    private readonly testRetireEventEmitter: EventEmitter<RetireEvent>,
    private readonly testServerLog: LogAppender,
    private readonly logger: SimpleLogger
  ) {
    this.disposables.push(logger);

    const karmaConfigPath = this.config.projectKarmaConfigFilePath;

    const configuredTestFramework: TestFramework | undefined =
      this.config.testFramework === TestFrameworkName.MochaBDD
        ? MochaTestFrameworkBdd
        : this.config.testFramework === TestFrameworkName.MochaTDD
        ? MochaTestFrameworkTdd
        : this.config.testFramework === TestFrameworkName.Jasmine
        ? JasmineTestFramework
        : undefined;

    this.testFramework = configuredTestFramework
      ? configuredTestFramework
      : karmaConfigPath !== undefined
      ? this.detectTestFramework(karmaConfigPath, this.fileHandler)
      : JasmineTestFramework;

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
  }

  public createFileWatcher(): FileWatcher {
    const reloadTriggerFiles = [...this.config.reloadOnChangedFiles];

    if (this.config.reloadOnKarmaConfigChange && this.config.projectKarmaConfigFilePath) {
      reloadTriggerFiles.push(this.config.projectKarmaConfigFilePath);
    }
    if (this.config.envFile) {
      reloadTriggerFiles.push(this.config.envFile);
    }

    const fileWatcherOptions: FileWatcherOptions = {
      retireTestsInChangedFiles: !this.isAutoWatchActive()
    };

    const fileWatcher = new FileWatcher(
      this.workspaceFolder,
      this.config.projectPath,
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
      testsBasePath: this.config.testsBasePath,
      testGrouping: this.config.testGrouping,
      flattenSingleChildFolders: this.config.flattenSingleChildFolders,
      rootSuiteLabel: this.projectNameSpace
        ? this.projectShortName
        : this.config.projectType === ProjectType.Angular
        ? 'Angular Tests'
        : 'Karma Tests'
    };

    const testSuiteOrganizer = new TestSuiteOrganizer(
      this.config.projectPath,
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

    if (this.config.projectType === ProjectType.Angular) {
      prioritizedTestFactories.push(this.createAngularFactory(testServerProcessLog, watchModeEnabled));
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

  private createTestLocator(fileHandler: FileHandler): TestLocator {
    const testLocatorOptions: TestLocatorOptions = {
      ignore: [...this.config.excludeFiles],
      cwd: this.config.projectPath
    };

    const testDefinitionProvider = this.createTestDefinitionProvider();

    return new TestLocator(
      this.config.projectPath,
      [...this.config.testFiles],
      testDefinitionProvider,
      fileHandler,
      this.createLogger(TestLocator.name),
      testLocatorOptions
    );
  }

  private createTestDefinitionProvider(): TestDefinitionProvider {
    return this.config.testParsingMethod === TestParsingMethod.RegExp
      ? this.createRegexpTestDefinitionProvider()
      : this.createAstTestDefinitionProvider();
  }

  private createRegexpTestDefinitionProvider(): RegexpTestDefinitionProvider {
    this.logger.debug(() => 'Creating Regex test definition provider');

    const testFileParser: RegexpTestFileParser = new RegexpTestFileParser(
      this.testFramework.getTestInterface(),
      this.createLogger(RegexpTestFileParser.name)
    );

    const testDefinitionProvider = new RegexpTestDefinitionProvider(
      testFileParser,
      this.createLogger(RegexpTestDefinitionProvider.name)
    );
    return testDefinitionProvider;
  }

  private createAstTestDefinitionProvider(): AstTestDefinitionProvider {
    this.logger.debug(() => 'Creating AST test definition provider');

    const testDescriptionNodeProcessor = new TestDescriptionNodeProcessor(
      this.createLogger(TestDescriptionNodeProcessor.name)
    );

    const sourceNodeProcessors: SourceNodeProcessor<ProcessedSourceNode>[] = [
      new TestAndSuiteNodeProcessor(
        this.testFramework.getTestInterface(),
        testDescriptionNodeProcessor,
        this.createLogger(TestAndSuiteNodeProcessor.name)
      ),
      new ForEachNodeProcessor(this.createLogger(ForEachNodeProcessor.name)),
      new LoopNodeProcessor(this.createLogger(LoopNodeProcessor.name)),
      new IfElseNodeProcessor(this.createLogger(IfElseNodeProcessor.name)),
      new FunctionDeclarationNodeProcessor(this.createLogger(FunctionDeclarationNodeProcessor.name)),
      new FunctionCallNodeProcessor(this.createLogger(FunctionCallNodeProcessor.name))
    ];

    const testFileParser: AstTestFileParser = new AstTestFileParser(
      sourceNodeProcessors,
      this.createLogger(AstTestFileParser.name),
      {
        enabledParserPlugins: this.config.enabledParserPlugins,
        useLenientMode: true
      }
    );

    const testDefinitionProvider = new AstTestDefinitionProvider(
      testFileParser,
      this.createLogger(AstTestDefinitionProvider.name)
    );
    return testDefinitionProvider;
  }

  private createKarmaFactory(serverProcessLog: ProcessLog, watchModeEnabled: boolean): KarmaFactory {
    const karmaFactoryConfig: KarmaFactoryConfig = {
      projectPath: this.config.projectPath,
      baseKarmaConfFilePath: this.config.baseKarmaConfFilePath,
      projectKarmaConfigFilePath: this.config.projectKarmaConfigFilePath,
      autoWatchEnabled: watchModeEnabled,
      autoWatchBatchDelay: this.config.autoWatchBatchDelay,
      logLevel: this.config.logLevel,
      karmaLogLevel: this.config.karmaLogLevel,
      karmaReporterLogLevel: this.config.karmaReporterLogLevel,
      customLauncher: this.config.customLauncher,
      userSpecifiedLaunchConfig: this.config.userSpecifiedLaunchConfig,
      environment: this.config.environment,
      envExclude: this.config.envExclude,
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

  private createAngularFactory(serverProcessLog: ProcessLog, watchModeEnabled: boolean): AngularFactory {
    const angularFactoryConfig: AngularFactoryConfig = {
      projectName: this.config.projectName,
      projectPath: this.config.projectPath,
      projectInstallRootPath: this.config.projectInstallRootPath,
      baseKarmaConfFilePath: this.config.baseKarmaConfFilePath,
      projectKarmaConfigFilePath: this.config.projectKarmaConfigFilePath,
      autoWatchEnabled: watchModeEnabled,
      autoWatchBatchDelay: this.config.autoWatchBatchDelay,
      logLevel: this.config.logLevel,
      karmaLogLevel: this.config.karmaLogLevel,
      karmaReporterLogLevel: this.config.karmaReporterLogLevel,
      customLauncher: this.config.customLauncher,
      userSpecifiedLaunchConfig: this.config.userSpecifiedLaunchConfig,
      environment: this.config.environment,
      envExclude: this.config.envExclude,
      browser: this.config.browser,
      angularProcessCommand: this.config.angularProcessCommand,
      failOnStandardError: this.config.failOnStandardError,
      allowGlobalPackageFallback: this.config.allowGlobalPackageFallback
    };

    return new AngularFactory(
      angularFactoryConfig,
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
      this.testHelper,
      this.config.projectPath,
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
        this.testHelper,
        this.config.projectPath,
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
      this.createLogger(KarmaTestRunProcessor.name)
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
          `Falling back to test framework: ${testFramework?.name}`
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
