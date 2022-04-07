import { debug, DebugSession, EventEmitter, WorkspaceFolder } from 'vscode';
import {
  RetireEvent,
  TestLoadFinishedEvent,
  TestLoadStartedEvent,
  TestRunFinishedEvent,
  TestRunStartedEvent,
  TestSuiteInfo
} from 'vscode-test-adapter-api';
import { ServerStartInfo, TestManager } from '../api/test-manager';
import { DEBUG_SESSION_START_TIMEOUT } from '../constants';
import { Disposable, NonDisposable } from '../util/disposable/disposable';
import { Disposer } from '../util/disposable/disposer';
import { DeferredPromise } from '../util/future/deferred-promise';
import { Execution } from '../util/future/execution';
import { SimpleLogger } from '../util/logging/simple-logger';
import { ProcessHandler } from '../util/process/process-handler';
import { TestLoadEvent, TestResultEvent, TestRunEvent } from './base/test-events';
import { CancellationRequestedError } from './cancellation-requested-error';
import { ConfigSetting } from './config/config-setting';
import { ConfigStore } from './config/config-store';
import { ExtensionConfig } from './config/extension-config';
import { Debugger } from './debugger';
import { TestLocator } from './test-locator';
import { TestStore } from './test-store';
import { MessageType, NotificationHandler, StatusType } from './vscode/notifications/notification-handler';
import { OutputChannelLog } from './vscode/output-channel-log';

export interface KarmaTestExplorerOptions {
  projectNamespace?: string;
  configDefaults?: ConfigStore<ConfigSetting>;
  configOverrides?: ConfigStore<ConfigSetting>;
  outputChannelLog?: OutputChannelLog;
}

export class KarmaTestExplorer implements Disposable {
  private readonly disposables: Disposable[] = [];
  private isTestProcessRunning: boolean = false;

  constructor(
    public readonly workspaceFolder: WorkspaceFolder,
    private readonly config: NonDisposable<ExtensionConfig>, // FIXME: get from factory
    private readonly testManager: TestManager,
    private readonly testLocator: TestLocator,
    private readonly testStore: NonDisposable<TestStore>,
    private readonly processHandler: ProcessHandler,
    private readonly testDebugger: NonDisposable<Debugger>,
    private readonly testLoadEmitter: NonDisposable<EventEmitter<TestLoadEvent>>,
    private readonly testRunEmitter: NonDisposable<EventEmitter<TestRunEvent | TestResultEvent>>,
    private readonly retireEmitter: NonDisposable<EventEmitter<RetireEvent>>,
    private readonly notificationHandler: NonDisposable<NotificationHandler>,
    private readonly logger: SimpleLogger
  ) {
    this.disposables.push(logger);
  }

  public async runTests(testIds: string[], isDebug: boolean = false): Promise<void> {
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

        this.notificationHandler.notify(MessageType.Error, errorMessage, [
          { label: 'Retry Test Run', handler: () => (isDebug ? this.debugTests(testIds) : this.runTests(testIds)) }
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

  public async debugTests(testIds: string[]): Promise<void> {
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

        this.notificationHandler.notifyStatus(
          StatusType.Busy,
          `Starting debug session: ${debuggerConfigName}`,
          deferredDebugSessionStart.promise()
        );

        debugSessionExecution = this.testDebugger.startDebugSession(
          this.workspaceFolder,
          debuggerConfig,
          DEBUG_SESSION_START_TIMEOUT
        );

        debugSession = await debugSessionExecution.started();
        deferredDebugSessionStart.fulfill();
      } catch (error) {
        const errorMessage = `Test debug run failed - ${(error as Error).message ?? error}`;
        this.logger.error(() => errorMessage);

        this.notificationHandler.notify(MessageType.Error, errorMessage, [
          { label: 'Retry Debug', handler: () => this.debugTests(testIds) },
          { label: 'Retry With Run', handler: () => this.runTests(testIds) }
        ]);

        return;
      }

      await this.runTests(testIds, true);
      await debug.stopDebugging(debugSession);
      await debugSessionExecution.ended();
    } finally {
      this.isTestProcessRunning = false;
    }
  }

  public async loadTests(): Promise<void> {
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
    await this.loadTests();
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
      this.notificationHandler.notifyStatus(StatusType.Busy, 'Loading test files', testFileLoadCompletion);
      await testFileLoadCompletion;

      discoveredTests = await this.testManager.discoverTests();
      testLoadFinishedEvent.suite = discoveredTests;

      this.logger.debug(() => `Test discovery got ${discoveredTests?.testCount ?? 0} tests`);
    } catch (error) {
      if (!(error instanceof CancellationRequestedError)) {
        testDiscoveryError = `Failed to load tests - ${(error as Error).message ?? error}`;
        testLoadFinishedEvent.errorMessage = testDiscoveryError;

        this.logger.error(() => testDiscoveryError!);

        this.notificationHandler.notify(MessageType.Error, testDiscoveryError, [
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

  private verifyNoTestProcessCurrentlyRunning(message: string): boolean {
    if (!this.isTestProcessRunning) {
      return true;
    }
    const otherTestProcessRunningMessage = `${message} - Another test operation is still running`;
    this.logger.debug(() => otherTestProcessRunningMessage);
    this.notificationHandler.notify(MessageType.Warning, otherTestProcessRunningMessage);

    return false;
  }

  public async dispose(): Promise<void> {
    const futureCancelation = this.cancel();
    this.processHandler.killAll();
    await futureCancelation;
    await Disposer.dispose(this.disposables);
  }
}
