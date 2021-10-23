import { resolve } from 'path';
import { debounce } from 'throttle-debounce';
import {
  commands,
  ConfigurationChangeEvent,
  debug,
  DebugSession,
  Event,
  EventEmitter,
  FileChangeType,
  FileSystemWatcher,
  Uri,
  workspace,
  WorkspaceFolder
} from 'vscode';
import {
  RetireEvent,
  TestAdapter,
  TestEvent,
  TestInfo,
  TestLoadFinishedEvent,
  TestLoadStartedEvent,
  TestRunFinishedEvent,
  TestRunStartedEvent,
  TestSuiteEvent,
  TestSuiteInfo
} from 'vscode-test-adapter-api';
import { ServerStartInfo, TestManager } from './api/test-manager';
import {
  CONFIG_FILE_CHANGE_BATCH_DELAY,
  DEBUG_SESSION_START_TIMEOUT,
  EXTENSION_CONFIG_PREFIX,
  EXTENSION_NAME,
  EXTENSION_OUTPUT_CHANNEL_NAME,
  WATCHED_FILE_CHANGE_BATCH_DELAY
} from './constants';
import { TestLoadEvent, TestResultEvent, TestRunEvent } from './core/base/test-events';
import { TestType } from './core/base/test-infos';
import { TestResolver } from './core/base/test-resolver';
import { CancellationRequestedError } from './core/cancellation-requested-error';
import { ConfigSetting } from './core/config/config-setting';
import { ConfigStore } from './core/config/config-store';
import { ExtensionConfig } from './core/config/extension-config';
import { Debugger } from './core/debugger';
import { MainFactory } from './core/main-factory';
import { SpecLocator } from './core/spec-locator';
import { ExtensionCommands } from './core/vscode/extension-commands';
import { MessageType, Notifications, StatusType } from './core/vscode/notifications';
import { OutputChannelLog } from './core/vscode/output-channel-log';
import { Disposable } from './util/disposable/disposable';
import { Disposer } from './util/disposable/disposer';
import { DeferredPromise } from './util/future/deferred-promise';
import { Execution } from './util/future/execution';
import { SimpleLogger } from './util/logging/simple-logger';
import { getCircularReferenceReplacer, normalizePath } from './util/utils';

export class Adapter implements TestAdapter, Disposable {
  private specLocator?: SpecLocator;
  private isTestProcessRunning: boolean = false;
  private loadedRootSuite?: TestSuiteInfo;
  private loadedTestsById: Map<string, TestInfo | TestSuiteInfo> = new Map();
  private hasPendingConfigUpdates: boolean = false;

  private readonly initDisposables: Disposable[] = [];
  private readonly disposables: Disposable[] = [];

  private readonly retireEmitter = new EventEmitter<RetireEvent>();
  private readonly testLoadEmitter = new EventEmitter<TestLoadEvent>();
  private readonly testRunEmitter = new EventEmitter<TestRunEvent | TestResultEvent>();
  private readonly autorunEmitter = new EventEmitter<void>();
  private readonly extensionOutputChannelLog: OutputChannelLog;

  private config!: ExtensionConfig;
  private logger!: SimpleLogger;
  private debugger!: Debugger;
  private notifications!: Notifications;
  private testManager!: TestManager;
  private factory!: MainFactory;

  constructor(public readonly workspaceFolder: WorkspaceFolder) {
    this.extensionOutputChannelLog = new OutputChannelLog(EXTENSION_OUTPUT_CHANNEL_NAME);

    this.init();

    const debouncedConfigChangeHandler = debounce(
      CONFIG_FILE_CHANGE_BATCH_DELAY,
      true,
      this.handleConfigurationChange.bind(this)
    );

    this.disposables.push(
      this.extensionOutputChannelLog,
      this.testLoadEmitter,
      this.testRunEmitter,
      this.autorunEmitter,
      workspace.onDidChangeConfiguration(debouncedConfigChangeHandler),
      commands.registerCommand(`${ExtensionCommands.ShowLog}`, () => this.extensionOutputChannelLog.show()),
      commands.registerCommand(`${ExtensionCommands.Reload}`, () => this.reload()),
      commands.registerCommand(`${ExtensionCommands.ExecuteFunction}`, (fn: () => void) => fn())
    );
  }

  private async reinit() {
    await Disposer.dispose(this.initDisposables);
    this.init();
  }

  private init() {
    this.config = this.createConfig();
    this.initDisposables.push(this.config);

    this.logger = new SimpleLogger(this.extensionOutputChannelLog, Adapter.name, this.config.logLevel);
    this.initDisposables.push(this.logger);
    this.logger.info(() => 'Initializing adapter');

    this.logger.debug(
      () => `Using extension configuration: ${JSON.stringify(this.config, getCircularReferenceReplacer(), 2)}`
    );

    this.logger.debug(() => 'Creating status bar display');
    this.notifications = new Notifications(new SimpleLogger(this.logger, Notifications.name));
    this.initDisposables.push(this.notifications);

    this.logger.debug(() => 'Creating main factory');
    this.factory = new MainFactory(this.config, this.notifications, new SimpleLogger(this.logger, MainFactory.name));
    this.initDisposables.push(this.factory);

    this.logger.debug(() => 'Creating file watchers');
    const fileWatchers = this.createFileWatchers();
    this.initDisposables.push(...fileWatchers);

    this.logger.debug(() => 'Getting spec locator');
    this.specLocator = this.factory.getSpecLocator();

    this.logger.debug(() => 'Creating debugger');
    this.debugger = new Debugger(new SimpleLogger(this.logger, Debugger.name));
    this.initDisposables.push(this.debugger);

    this.logger.debug(() => 'Creating test manager');
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

  public async run(testIds: string[], isDebug: boolean = false): Promise<void> {
    if (!isDebug && !this.verifyNoTestProcessCurrentlyRunning('Cannot run new test')) {
      return;
    }

    try {
      this.isTestProcessRunning = isDebug ? this.isTestProcessRunning : true;
      const testRunStartTime = Date.now();

      this.logger.info(() => `${isDebug ? 'Debug test' : 'Test'} run started`);
      this.logger.debug(() => `Test run is requested for ${testIds.length} test ids`);
      this.logger.trace(() => `Requested test ids for test run: ${JSON.stringify(testIds)}`);

      const tests = testIds.map(testId => this.loadedTestsById.get(testId)).filter(test => test !== undefined) as (
        | TestInfo
        | TestSuiteInfo
      )[];

      const testsContainOnlyRootSuite =
        this.loadedRootSuite !== undefined ? tests.length === 1 && tests[0] === this.loadedRootSuite : false;
      const runAllTests = testsContainOnlyRootSuite;

      this.logger.trace(
        () => `Requested ${testIds.length} test Ids resolved to ${tests.length} actual tests: ${JSON.stringify(tests)}`
      );

      const testRunStartedEvent: TestRunStartedEvent = { type: 'started', tests: testIds };
      this.testRunEmitter.fire(testRunStartedEvent);

      let runError: string | undefined;

      try {
        if (!this.testManager.isStarted()) {
          this.logger.info(
            () => `${isDebug ? 'Debug test' : 'Test'} run request - Test manager is not started - Starting it`
          );
          await this.testManager.start();
        }
        await this.specLocator?.ready();
        await this.testManager.runTests(runAllTests ? [] : tests);
      } catch (error) {
        runError = `${(error as Error).message ?? error}`;
      } finally {
        const testRunFinishedEvent: TestRunFinishedEvent = { type: 'finished' };
        this.testRunEmitter.fire(testRunFinishedEvent);
      }

      if (runError) {
        const errorMessage = `Failed while ${isDebug ? 'debugging' : 'running'} requested tests - ${runError}`;
        this.logger.error(() => errorMessage);
        this.retireEmitter.fire({ tests: testIds });

        this.notifications.notify(MessageType.Error, errorMessage, [
          { label: 'Retry Test Run', handler: () => (isDebug ? this.debug(testIds) : this.run(testIds)) }
        ]);
      }

      const testRunTotalTimeSecs = (Date.now() - testRunStartTime) / 1000;
      this.logger.info(
        () => ` ${isDebug ? 'Debug test' : 'Test'} run finished in ${testRunTotalTimeSecs.toFixed(2)} secs`
      );
    } finally {
      this.isTestProcessRunning = isDebug ? this.isTestProcessRunning : false;
    }
  }

  public async debug(testIds: string[]): Promise<void> {
    if (!this.verifyNoTestProcessCurrentlyRunning('New test debug request ignored')) {
      return;
    }
    this.isTestProcessRunning = true;

    this.logger.info(() => 'Starting debug session');
    this.logger.debug(() => `Test debug is requested for ${testIds.length} test ids`);
    this.logger.trace(() => `Requested test ids for test debug: ${JSON.stringify(testIds)}`);

    try {
      let debugSessionExecution: Execution<DebugSession>;
      let debugSession: DebugSession;

      try {
        this.logger.debug(() => 'Ensuring Test Manager is started for debug test run');

        const serverStartInfo: ServerStartInfo = await this.testManager.start();

        const debuggerConfig = this.config.debuggerConfigName || {
          ...this.config.debuggerConfig,
          port: serverStartInfo.debugPort ?? this.config.debuggerConfig.port
        };

        const debuggerConfigName = typeof debuggerConfig === 'string' ? debuggerConfig : debuggerConfig.name;
        const debuggerPort = typeof debuggerConfig !== 'string' ? debuggerConfig.port : undefined;

        if (debuggerPort) {
          this.logger.info(
            () =>
              `Starting debug session '${debuggerConfigName}' ` +
              'with requested --> available debug port: ' +
              `${this.config.debuggerConfig.port ?? '<none>'} --> ${debuggerPort}`
          );
        } else {
          this.logger.info(() => `Starting debug session '${debuggerConfigName}'`);
        }

        const deferredDebugSessionStart = new DeferredPromise();

        this.notifications.notifyStatus(
          StatusType.Busy,
          `Starting debug session: ${debuggerConfigName}...`,
          deferredDebugSessionStart.promise()
        );

        debugSessionExecution = this.debugger.startDebugSession(
          this.workspaceFolder,
          debuggerConfig,
          DEBUG_SESSION_START_TIMEOUT
        );

        debugSession = await debugSessionExecution.started();
        deferredDebugSessionStart.fulfill();
      } catch (error) {
        const errorMessage = `Test debug run failed - ${(error as Error).message ?? error}`;
        this.logger.error(() => errorMessage);

        this.notifications.notify(MessageType.Error, errorMessage, [
          { label: 'Retry Debug', handler: () => this.debug(testIds) },
          { label: 'Retry With Run', handler: () => this.run(testIds) }
        ]);

        return;
      }

      await this.run(testIds, true);
      await debug.stopDebugging(debugSession);
      await debugSessionExecution.ended();
    } finally {
      this.isTestProcessRunning = false;
    }
  }

  public async load(): Promise<void> {
    if (!this.verifyNoTestProcessCurrentlyRunning('New test load request ignored')) {
      return;
    }
    this.isTestProcessRunning = true;
    this.logger.debug(() => 'Test load started');

    try {
      await this.refresh(true);
    } finally {
      this.isTestProcessRunning = false;
    }
  }

  private async reload(): Promise<void> {
    this.logger.debug(() => 'Test reload started');

    if (this.isTestProcessRunning) {
      this.logger.debug(() => 'Test reload - Aborting previously running test operation');
      await this.cancel();
    }
    await this.load();
  }

  private async refresh(isForcedRefresh: boolean = false): Promise<void> {
    this.logger.debug(() => `Test ${isForcedRefresh ? 'hard ' : ''}refresh started`);

    const refreshStartTime = Date.now();
    const testLoadFinishedEvent: TestLoadFinishedEvent = { type: 'finished' };
    let discoveredTests: TestSuiteInfo | undefined;
    let testDiscoveryError: string | undefined;

    try {
      this.testLoadEmitter.fire({ type: 'started' } as TestLoadStartedEvent);
      this.specLocator?.refreshFiles();

      if (!this.testManager.isStarted()) {
        this.logger.debug(() => 'Refresh request - Test manager is not started - Starting it');
        await this.testManager.start();
      } else if (isForcedRefresh) {
        await this.testManager.restart();
      }
      await this.specLocator?.ready();
      discoveredTests = await this.testManager.discoverTests();
      testLoadFinishedEvent.suite = discoveredTests;

      this.logger.debug(() => `Test discovery got ${discoveredTests?.testCount ?? 0} tests`);
    } catch (error) {
      if (!(error instanceof CancellationRequestedError)) {
        testDiscoveryError = `Failed to load tests - ${(error as Error).message ?? error}`;
        testLoadFinishedEvent.errorMessage = testDiscoveryError;

        this.logger.error(() => testDiscoveryError!);

        this.notifications.notify(MessageType.Error, testDiscoveryError, [
          { label: 'Retry Test Load', handler: () => this.reload() }
        ]);
      }
    } finally {
      this.storeLoadedTests(discoveredTests);
      this.testLoadEmitter.fire(testLoadFinishedEvent);
      this.retireEmitter.fire({});
    }

    const refreshTotalTimeSecs = (Date.now() - refreshStartTime) / 1000;

    this.logger.info(
      () =>
        `Finished loading tests in ${refreshTotalTimeSecs.toFixed(2)} secs ` +
        (testDiscoveryError ? '(Failed)' : `(${discoveredTests?.testCount ?? 0} tests loaded)`)
    );
  }

  public async cancel(): Promise<void> {
    this.logger.debug(() => 'Test operation cancellation requested - Aborting any currently running test operation');
    await this.testManager.stop();
    this.isTestProcessRunning = false;
  }

  private async reset(): Promise<void> {
    this.logger.debug(() => 'Adapter reset started');

    if (this.isTestProcessRunning) {
      await this.cancel();
    }
    await this.reinit();
    await this.load();
  }

  private storeLoadedTests(rootSuite?: TestSuiteInfo) {
    this.logger.debug(() => 'Updating loaded test tree');

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

  private createConfig(): ExtensionConfig {
    const config: ConfigStore = workspace.getConfiguration(EXTENSION_CONFIG_PREFIX, this.workspaceFolder.uri);
    const configLogger = new SimpleLogger(this.logger, ExtensionConfig.name);
    return new ExtensionConfig(config, this.workspaceFolder.uri.path, configLogger);
  }

  private createFileWatchers(): Disposable[] {
    this.logger.debug(() => 'Creating file watchers for monitored files');

    const reloadTriggerFiles = [...this.config.reloadOnChangedFiles];
    if (this.config.reloadOnKarmaConfigChange) {
      reloadTriggerFiles.push(this.config.userKarmaConfFilePath);
    }
    if (this.config.envFile) {
      reloadTriggerFiles.push(this.config.envFile);
    }

    const reloadTriggerFilesWatchers = this.registerFileHandler(
      reloadTriggerFiles,
      debounce(WATCHED_FILE_CHANGE_BATCH_DELAY, fileUri => {
        const filePath = fileUri.fsPath;
        this.logger.info(() => `Requesting adapter reset - monitored file changed: ${filePath}`);
        this.reset();
      })
    );

    this.logger.debug(() => 'Creating file watchers for test file changes');

    const reloadTestFilesWatchers = this.registerFileHandler(this.config.testFiles, async (fileUri, changeType) => {
      const changedTestFile = fileUri.fsPath;
      if (!this.specLocator?.isSpecFile(changedTestFile)) {
        this.logger.warn(() => `Expected changed file to be spec file but it is not: ${changedTestFile}`);
        return;
      }
      this.logger.debug(() => `Changed file is spec file: ${changedTestFile}`);

      if (this.factory.getTestFramework().getTestCapabilities().watchModeSupport) {
        await (changeType === FileChangeType.Deleted
          ? this.specLocator.removeFiles([changedTestFile])
          : this.specLocator.refreshFiles([changedTestFile]));
      } else {
        const changedTestIds: string[] = Array.from(this.loadedTestsById.values())
          .filter(loadedTest => loadedTest.file === changedTestFile)
          .map(changedTest => changedTest.id);

        if (changedTestIds.length > 0) {
          this.logger.debug(() => `Retiring ${changedTestIds.length} tests from updated spec file: ${changedTestFile}`);
          this.retireEmitter.fire({ tests: changedTestIds });
        }
      }
    });

    return [...reloadTriggerFilesWatchers, ...reloadTestFilesWatchers];
  }

  private registerFileHandler(
    filePatterns: readonly string[],
    handler: (fileUri: Uri, changeType: FileChangeType) => void
  ): FileSystemWatcher[] {
    const fileWatchers: FileSystemWatcher[] = [];

    this.logger.debug(() => `Registering file handler for files: ${filePatterns}`);

    for (const fileOrPattern of filePatterns) {
      const absoluteFileOrPattern = normalizePath(resolve(this.config.projectRootPath, fileOrPattern));
      const fileWatcher = workspace.createFileSystemWatcher(absoluteFileOrPattern);
      fileWatchers.push(fileWatcher);

      this.logger.debug(
        () =>
          `Creating file watcher for file or pattern '${fileOrPattern}' ` +
          `using absolute file or pattern: ${absoluteFileOrPattern}`
      );

      this.disposables.push(
        fileWatcher.onDidChange(fileUri => handler(fileUri, FileChangeType.Changed)),
        fileWatcher.onDidCreate(fileUri => handler(fileUri, FileChangeType.Created)),
        fileWatcher.onDidDelete(fileUri => handler(fileUri, FileChangeType.Deleted))
      );
    }
    return fileWatchers;
  }

  private async handleConfigurationChange(configChangeEvent: ConfigurationChangeEvent): Promise<void> {
    this.logger.info(() => 'Configuration changed');

    if (this.hasPendingConfigUpdates) {
      this.logger.debug(() => 'Ignoring new configuration changes - Refresh already pending for previous changes');
      return;
    }

    const hasRelevantSettingsChange = Object.values(ConfigSetting).some(setting => {
      const settingChanged = configChangeEvent.affectsConfiguration(
        `${EXTENSION_CONFIG_PREFIX}.${setting}`,
        this.workspaceFolder.uri
      );
      if (settingChanged) {
        this.logger.debug(() => `Relevant changed config setting: ${setting}`);
      }
      return settingChanged;
    });

    if (!hasRelevantSettingsChange) {
      this.logger.info(() => 'No relevant configuration change');
      return;
    }
    this.hasPendingConfigUpdates = true;

    const applyUpdatedSettingsHandler = async () => {
      this.logger.info(() => 'Resetting adapter with updated configuration');
      await this.reset();
      this.hasPendingConfigUpdates = false;
    };

    this.notifications.notify(
      MessageType.Warning,
      `${EXTENSION_NAME} settings changed. Apply the changes?`,
      [{ label: 'Apply Settings', handler: applyUpdatedSettingsHandler }],
      { dismissAction: true }
    );
  }

  private verifyNoTestProcessCurrentlyRunning(message: string): boolean {
    if (!this.isTestProcessRunning) {
      return true;
    }
    const otherTestProcessRunningMessage = `${message} - Another test operation is still running`;
    this.logger.debug(() => otherTestProcessRunningMessage);
    this.notifications.notify(MessageType.Warning, otherTestProcessRunningMessage);

    return false;
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

  public async dispose(): Promise<void> {
    await Disposer.dispose(this.initDisposables, this.disposables);
  }
}
