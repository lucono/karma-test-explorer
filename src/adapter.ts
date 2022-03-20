import { debounce } from 'throttle-debounce';
import {
  ConfigurationChangeEvent,
  debug,
  DebugSession,
  Event,
  EventEmitter,
  window,
  workspace,
  WorkspaceFolder
} from 'vscode';
import {
  RetireEvent,
  TestAdapter,
  TestEvent,
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
  EXTENSION_OUTPUT_CHANNEL_NAME
} from './constants';
import { TestLoadEvent, TestResultEvent, TestRunEvent } from './core/base/test-events';
import { CancellationRequestedError } from './core/cancellation-requested-error';
import { ConfigSetting, ExternalConfigSetting } from './core/config/config-setting';
import { ConfigStore } from './core/config/config-store';
import { ExtensionConfig } from './core/config/extension-config';
import { LayeredConfigStore } from './core/config/layered-config-store';
import { Debugger } from './core/debugger';
import { MainFactory } from './core/main-factory';
import { TestLocator } from './core/test-locator';
import { TestStore } from './core/test-store';
import { Commands } from './core/vscode/commands/commands';
import { ProjectCommand } from './core/vscode/commands/project-command';
import { MessageType, Notifications, StatusType } from './core/vscode/notifications';
import { OutputChannelLog } from './core/vscode/output-channel-log';
import { Disposable } from './util/disposable/disposable';
import { Disposer } from './util/disposable/disposer';
import { DeferredPromise } from './util/future/deferred-promise';
import { Execution } from './util/future/execution';
import { LogLevel } from './util/logging/log-level';
import { SimpleLogger } from './util/logging/simple-logger';
import { getCircularReferenceReplacer } from './util/utils';

export class Adapter implements TestAdapter, Disposable {
  private config: ExtensionConfig;
  private logger: SimpleLogger;
  private testStore?: TestStore;
  private testLocator?: TestLocator;
  private isTestProcessRunning: boolean = false;
  private hasPendingConfigUpdates: boolean = false;

  private readonly initDisposables: Disposable[] = [];
  private readonly disposables: Disposable[] = [];

  private readonly outputChannelLog: OutputChannelLog;
  private readonly projectCommands: Commands<ProjectCommand>;
  private readonly notifications: Notifications;
  private readonly testLoadEmitter = new EventEmitter<TestLoadEvent>();
  private readonly testRunEmitter = new EventEmitter<TestRunEvent | TestResultEvent>();
  private readonly retireEmitter = new EventEmitter<RetireEvent>();

  private debugger!: Debugger;
  private testManager!: TestManager;
  private factory!: MainFactory;

  constructor(
    public readonly workspaceFolder: WorkspaceFolder,
    private readonly projectNameSpace: string,
    private readonly configOverrides: ConfigStore<ConfigSetting>,
    outputChannelLog?: OutputChannelLog
  ) {
    let channelLog = outputChannelLog;

    if (!channelLog) {
      channelLog = new OutputChannelLog(`${EXTENSION_OUTPUT_CHANNEL_NAME} (${projectNameSpace})`);
      this.disposables.push(channelLog);
    }
    this.outputChannelLog = channelLog;
    this.config = this.createConfig();
    this.logger = new SimpleLogger(this.outputChannelLog, Adapter.name, this.config.logLevel);

    this.logger.debug(() => 'Creating project commands handler');
    this.projectCommands = new Commands<ProjectCommand>(
      new SimpleLogger(this.logger, Commands.name),
      `${EXTENSION_CONFIG_PREFIX}.${this.projectNameSpace}`
    );
    this.projectCommands.register(ProjectCommand.ShowLog, () => this.outputChannelLog.show());
    this.projectCommands.register(ProjectCommand.Reload, () => this.reload());
    this.projectCommands.register(ProjectCommand.Reset, () => this.reset());
    this.disposables.push(this.projectCommands);

    this.logger.debug(() => 'Creating notifications handler');
    this.notifications = new Notifications(
      window.createStatusBarItem(),
      this.projectCommands,
      new SimpleLogger(this.logger, Notifications.name)
    );
    this.disposables.push(this.notifications);

    this.init(this.config, this.logger);

    const debouncedConfigChangeHandler = debounce(
      CONFIG_FILE_CHANGE_BATCH_DELAY,
      true,
      this.handleConfigurationChange.bind(this)
    );

    this.disposables.push(
      this.testLoadEmitter,
      this.testRunEmitter,
      workspace.onDidChangeConfiguration(debouncedConfigChangeHandler)
    );
  }

  private init(config?: ExtensionConfig, logger?: SimpleLogger) {
    this.config = config ?? this.createConfig();
    this.initDisposables.push(this.config);

    this.logger = logger ?? new SimpleLogger(this.outputChannelLog, Adapter.name, this.config.logLevel);
    this.initDisposables.push(this.logger);
    this.logger.debug(() => 'Initializing adapter');

    this.logger.debug(
      () =>
        `Initializing with extension configuration: ` +
        `${JSON.stringify(this.config, getCircularReferenceReplacer(), 2)}`
    );

    this.logger.debug(() => 'Creating main factory');
    this.factory = new MainFactory(
      this.workspaceFolder,
      this.projectNameSpace,
      this.config,
      this.projectCommands,
      this.notifications,
      this.testLoadEmitter,
      this.testRunEmitter as EventEmitter<TestRunEvent>,
      this.testRunEmitter as EventEmitter<TestResultEvent>,
      this.retireEmitter,
      new SimpleLogger(this.logger, MainFactory.name)
    );
    this.initDisposables.push(this.factory);

    this.logger.debug(() => 'Creating file watcher');
    this.initDisposables.push(this.factory.createFileWatcher());

    this.logger.debug(() => 'Getting test locator');
    this.testLocator = this.factory.getTestLocator();

    this.logger.debug(() => 'Getting debugger');
    this.debugger = this.factory.getDebugger();

    this.logger.debug(() => 'Getting test store');
    this.testStore = this.factory.getTestStore();

    this.logger.debug(() => 'Creating test manager');
    this.testManager = this.factory.createTestManager();
    this.initDisposables.push(this.testManager);
  }

  private async reinit() {
    await Disposer.dispose(this.initDisposables);
    this.init();
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

      const rootTestSuite = this.testStore?.getRootSuite();
      const tests = this.testStore?.getTestsOrSuitesById(testIds) ?? [];

      const testsContainOnlyRootSuite = rootTestSuite !== undefined && tests.length === 1 && tests[0] === rootTestSuite;
      const runAllTests = testsContainOnlyRootSuite;

      this.logger.trace(
        () => `Requested ${testIds.length} test Ids resolved to ${tests.length} actual tests: ${JSON.stringify(tests)}`
      );

      const testRunStartedEvent: TestRunStartedEvent = { type: 'started', tests: testIds };
      this.testRunEmitter.fire(testRunStartedEvent);

      let runError: string | undefined;

      try {
        if (!this.testManager.isStarted()) {
          this.logger.debug(
            () => `${isDebug ? 'Debug test' : 'Test'} run request - Test manager is not started - Starting it`
          );
          await this.testManager.start();
        }
        await this.testLocator?.ready();
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
          this.logger.debug(
            () =>
              `Starting debug session '${debuggerConfigName}' ` +
              'with requested --> available debug port: ' +
              `${this.config.debuggerConfig.port ?? '<none>'} --> ${debuggerPort}`
          );
        } else {
          this.logger.debug(() => `Starting debug session '${debuggerConfigName}'`);
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
      this.testLocator?.refreshFiles();

      if (!this.testManager.isStarted()) {
        this.logger.debug(() => 'Refresh request - Test manager is not started - Starting it');
        await this.testManager.start();
      } else if (isForcedRefresh) {
        await this.testManager.restart();
      }

      const testFileLoadCompletion = this.testLocator?.ready();
      this.notifications.notifyStatus(StatusType.Busy, 'Loading test files...', testFileLoadCompletion);
      await testFileLoadCompletion;

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
    this.logger.debug(() => 'Updating loaded test store');

    if (rootSuite) {
      this.logger.debug(() => 'Storing newly loaded root suite');
      this.testStore?.storeRootSuite(rootSuite);
    } else {
      this.logger.debug(() => 'Clearing loaded root suite');
      this.testStore?.clear();
    }
  }

  private createConfig(): ExtensionConfig {
    const baseConfig: ConfigStore<ConfigSetting> = workspace.getConfiguration(
      EXTENSION_CONFIG_PREFIX,
      this.workspaceFolder.uri
    );
    const config: ConfigStore<ConfigSetting> = new LayeredConfigStore(baseConfig, this.configOverrides);
    const logLevel = config.get<LogLevel>(ExternalConfigSetting.LogLevel);
    const configLogger = new SimpleLogger(this.outputChannelLog, ExtensionConfig.name, logLevel);
    return new ExtensionConfig(config, this.workspaceFolder.uri.path, configLogger);
  }

  private async handleConfigurationChange(configChangeEvent: ConfigurationChangeEvent): Promise<void> {
    this.logger.info(() => 'Configuration changed');

    if (this.hasPendingConfigUpdates) {
      this.logger.debug(() => 'Ignoring new configuration changes - Refresh already pending for previous changes');
      return;
    }

    const hasRelevantSettingsChange = Object.values(ExternalConfigSetting).some(setting => {
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
      this.logger.info(() => 'Reloading with updated configuration');
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

  public async dispose(): Promise<void> {
    await this.cancel();
    await Disposer.dispose(this.initDisposables, this.disposables);
  }
}
