import { Event, EventEmitter, workspace, WorkspaceFolder } from 'vscode';
import {
  RetireEvent,
  TestAdapter,
  TestEvent,
  TestLoadFinishedEvent,
  TestLoadStartedEvent,
  TestRunFinishedEvent,
  TestRunStartedEvent,
  TestSuiteEvent
} from 'vscode-test-adapter-api';
import { EXTENSION_CONFIG_PREFIX, EXTENSION_OUTPUT_CHANNEL_NAME } from './constants';
import { TestLoadEvent, TestResultEvent, TestRunEvent } from './core/base/test-events';
import { ConfigSetting, WorkspaceConfigSetting } from './core/config/config-setting';
import { ConfigStore } from './core/config/config-store';
import { ExtensionConfig } from './core/config/extension-config';
import { LayeredConfigStore } from './core/config/layered-config-store';
import { Debugger } from './core/debugger';
import { KarmaTestExplorer } from './core/karma-test-explorer';
import { MainFactory } from './core/main-factory';
import { Commands } from './core/vscode/commands/commands';
import { ProjectCommand } from './core/vscode/commands/project-command';
import { NotificationHandler } from './core/vscode/notifications/notification-handler';
import { StatusDisplay } from './core/vscode/notifications/status-display';
import { OutputChannelLog } from './core/vscode/output-channel-log';
import { Disposable } from './util/disposable/disposable';
import { Disposer } from './util/disposable/disposer';
import { LogLevel } from './util/logging/log-level';
import { SimpleLogger } from './util/logging/simple-logger';
import { PortAcquisitionClient } from './util/port/port-acquisition-client';
import { PortAcquisitionManager } from './util/port/port-acquisition-manager';
import { getCircularReferenceReplacer } from './util/utils';

export interface AdapterOptions {
  projectNamespace?: string;
  configDefaults?: ConfigStore<ConfigSetting>;
  configOverrides?: ConfigStore<ConfigSetting>;
  outputChannelLog?: OutputChannelLog;
}

export class Adapter implements TestAdapter, Disposable {
  private readonly outputChannelLog: OutputChannelLog;
  private readonly portAcquisitionClient: PortAcquisitionClient;
  private readonly debugger: Debugger;
  private readonly projectCommands: Commands<ProjectCommand>;
  private readonly notificationHandler: NotificationHandler;
  private readonly testLoadEmitter: EventEmitter<TestLoadEvent>;
  private readonly testRunEmitter: EventEmitter<TestRunEvent | TestResultEvent>;
  private readonly retireEmitter: EventEmitter<RetireEvent>;

  private logger: SimpleLogger;
  private karmaTestExplorer: KarmaTestExplorer;
  private testExplorerDisposables: Disposable[] = [];
  private readonly disposables: Disposable[] = [];

  constructor(
    public readonly workspaceFolder: WorkspaceFolder,
    private readonly projectDisplayName: string,
    portAcquisitionManager: PortAcquisitionManager,
    projectStatusDisplay: StatusDisplay,
    private readonly options?: AdapterOptions
  ) {
    let channelLog = options?.outputChannelLog;

    if (!channelLog) {
      const channelNamespaceLabel = options?.projectNamespace ? ` (${options.projectNamespace})` : '';
      channelLog = new OutputChannelLog(`${EXTENSION_OUTPUT_CHANNEL_NAME}${channelNamespaceLabel}`);
      this.disposables.push(channelLog);
    }
    this.outputChannelLog = channelLog;

    const config = this.createConfig();
    this.logger = new SimpleLogger(this.outputChannelLog, Adapter.name, config.logLevel);

    this.logger.debug(() => 'Creating port acquisition client');
    this.portAcquisitionClient = new PortAcquisitionClient(
      portAcquisitionManager,
      this.createLogger(PortAcquisitionClient.name)
    );

    this.logger.debug(() => 'Creating debugger');
    this.debugger = new Debugger(this.createLogger(Debugger.name), {
      debuggerNamespace: options?.projectNamespace ? projectDisplayName : undefined
    });
    this.disposables.push(this.debugger);

    this.logger.debug(() => 'Creating project commands handler');
    const commandsNamespace = options?.projectNamespace ? `.${options.projectNamespace}` : '';
    this.projectCommands = new Commands<ProjectCommand>(
      this.createLogger(Commands.name),
      `${EXTENSION_CONFIG_PREFIX}${commandsNamespace}`
    );
    this.projectCommands.register(ProjectCommand.ShowLog, () => this.outputChannelLog.show());
    this.projectCommands.register(ProjectCommand.Reset, () => this.reset());
    this.disposables.push(this.projectCommands);

    this.logger.debug(() => 'Creating notifications handler');
    this.notificationHandler = new NotificationHandler(
      projectStatusDisplay,
      this.createLogger(NotificationHandler.name),
      {
        showLogCommand: this.projectCommands.getCommandName(ProjectCommand.ShowLog)
      }
    );
    this.disposables.push(this.notificationHandler);

    this.logger.debug(() => 'Creating test emitters');
    this.testLoadEmitter = new EventEmitter();
    this.testRunEmitter = new EventEmitter();
    this.retireEmitter = new EventEmitter();
    this.disposables.push(this.testLoadEmitter, this.testRunEmitter, this.retireEmitter);

    const { testExplorer, testExplorerDisposables } = this.createTestExplorer(config);
    this.karmaTestExplorer = testExplorer;
    this.testExplorerDisposables = testExplorerDisposables;
  }

  private createTestExplorer(config: ExtensionConfig): {
    testExplorer: KarmaTestExplorer;
    testExplorerDisposables: Disposable[];
  } {
    this.logger.debug(() => 'Creating new test explorer');
    const testExplorerDisposables: Disposable[] = [];

    this.logger.debug(
      () =>
        `Re/creating test explorer with extension configuration: ` +
        `${JSON.stringify(config, getCircularReferenceReplacer(), 2)}`
    );

    this.logger.debug(() => 'Creating main factory');
    const factory = new MainFactory(
      this.workspaceFolder,
      this.projectDisplayName,
      this.options?.projectNamespace,
      config,
      this.debugger,
      this.portAcquisitionClient,
      this.projectCommands,
      this.notificationHandler,
      this.testLoadEmitter,
      this.testRunEmitter as EventEmitter<TestRunEvent>,
      this.testRunEmitter as EventEmitter<TestResultEvent>,
      this.retireEmitter,
      this.createLogger(MainFactory.name)
    );
    testExplorerDisposables.push(factory);

    this.logger.debug(() => 'Getting process handler from factory');
    const processHandler = factory.getProcessHandler();
    testExplorerDisposables.push(processHandler);

    this.logger.debug(() => 'Getting test locator from factory');
    const testLocator = factory.getTestLocator();
    testExplorerDisposables.push(testLocator);

    this.logger.debug(() => 'Getting test store from factory');
    const testStore = factory.getTestStore();
    testExplorerDisposables.push(testStore);

    this.logger.debug(() => 'Getting test manager from factory');
    const testManager = factory.createTestManager();
    testExplorerDisposables.push(testManager);

    this.logger.debug(() => 'Getting file watcher from factory');
    const fileWatcher = factory.createFileWatcher();
    testExplorerDisposables.push(fileWatcher);

    this.logger.debug(() => 'Creating test explorer'); // FIXME: Add project path to log
    const testExplorer = new KarmaTestExplorer(
      this.workspaceFolder,
      config,
      testManager,
      testLocator,
      testStore,
      processHandler,
      this.debugger,
      this.testLoadEmitter,
      this.testRunEmitter,
      this.retireEmitter,
      this.notificationHandler,
      this.logger
    );

    return {
      testExplorer: testExplorer,
      testExplorerDisposables: testExplorerDisposables
    };
  }

  private createConfig(): ExtensionConfig {
    const baseConfig: ConfigStore<ConfigSetting> = workspace.getConfiguration(
      EXTENSION_CONFIG_PREFIX,
      this.workspaceFolder.uri
    );
    const configStore: ConfigStore<ConfigSetting> = new LayeredConfigStore(
      this.options?.configDefaults,
      baseConfig,
      this.options?.configOverrides
    );
    const configuredLogLevel = configStore.get<LogLevel>(WorkspaceConfigSetting.LogLevel);

    return new ExtensionConfig(
      configStore,
      this.workspaceFolder.uri.path,
      new SimpleLogger(this.outputChannelLog, ExtensionConfig.name, configuredLogLevel)
    );
  }

  private createLogger(loggerName: string): SimpleLogger {
    return new SimpleLogger(this.logger, loggerName);
  }

  private async reset(): Promise<void> {
    this.logger.info(() => `Resetting adapter`);
    await this.disposeTestExplorer();

    const config = this.createConfig();
    this.logger = new SimpleLogger(this.outputChannelLog, Adapter.name, config.logLevel);

    const { testExplorer, testExplorerDisposables } = this.createTestExplorer(config);
    this.karmaTestExplorer = testExplorer;
    this.testExplorerDisposables = testExplorerDisposables;

    this.load();
  }

  public async run(testIds: string[], isDebug?: boolean): Promise<void> {
    return this.karmaTestExplorer.runTests(testIds, isDebug);
  }

  public async debug(testIds: string[]): Promise<void> {
    return this.karmaTestExplorer.debugTests(testIds);
  }

  public async load(): Promise<void> {
    return this.karmaTestExplorer.loadTests();
  }

  public async cancel(): Promise<void> {
    return this.reset();
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

  private async disposeTestExplorer(): Promise<void> {
    await this.karmaTestExplorer.dispose();
    await Disposer.dispose(this.testExplorerDisposables);
  }

  public async dispose(): Promise<void> {
    await this.disposeTestExplorer();
    await Disposer.dispose(this.disposables);
  }
}
