import RichPromise from 'bluebird';
import { TestInfo, TestSuiteInfo } from 'vscode-test-adapter-api';
import { ServerStartInfo, TestManager } from '../api/test-manager';
import { TestRunner } from '../api/test-runner';
import { TestServer } from '../api/test-server';
import { KarmaTestEventListener } from '../frameworks/karma/runner/karma-test-event-listener';
import { Disposable } from '../util/disposable/disposable';
import { Disposer } from '../util/disposable/disposer';
import { DeferredPromise } from '../util/future/deferred-promise';
import { Execution } from '../util/future/execution';
import { Logger } from '../util/logging/logger';
import { PortAcquisitionManager } from '../util/port-acquisition-manager';
import { TestType } from './base/test-infos';
import { ExtensionCommands } from './vscode/extension-commands';
import { MessageType, Notifications, StatusType } from './vscode/notifications';

export class DefaultTestManager implements TestManager {
  private disposables: Disposable[] = [];
  private actionIsRunning: boolean = false;
  private currentServerStartInfo?: ServerStartInfo;
  private systemCurrentlyStopping: Promise<void> | undefined;

  public constructor(
    private readonly testServer: TestServer,
    private readonly testRunner: TestRunner,
    private readonly karmaEventListener: KarmaTestEventListener,
    private readonly portManager: PortAcquisitionManager,
    private readonly defaultKarmaPort: number,
    private readonly defaultKarmaSocketConnectionPort: number,
    private readonly notifications: Notifications,
    private readonly logger: Logger,
    private readonly defaultDebugPort?: number
  ) {
    this.disposables.push(testServer, testRunner, karmaEventListener, portManager, notifications, logger);
  }

  public async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  public async start(): Promise<ServerStartInfo> {
    const testActionWasRunning = this.actionIsRunning;
    this.actionIsRunning = true;

    try {
      if (this.systemCurrentlyStopping) {
        this.logger.info(
          () =>
            'Request to start test manager - test manager is still stopping. ' +
            'Waiting for stop operation to complete before proceeding to start'
        );

        await this.systemCurrentlyStopping;
      }

      if (this.isStarted()) {
        this.logger.info(() => 'Request to start test manager ignored - test manager is already started');
        return this.currentServerStartInfo!;
      }

      const deferredReadyForTesting = new DeferredPromise();
      const futureReadyForTesting = deferredReadyForTesting.promise();

      // --- Stop system if currently running ---

      if (this.karmaEventListener.isRunning()) {
        this.logger.info(() => 'Stopping currently running karma test event listener session');
        await this.karmaEventListener.stop();
      }

      if (this.testServer.isRunning()) {
        this.logger.info(() => 'Stopping currently running karma server');
        await this.testServer.stop();
      }

      // --- Acquire available ports for system re-execution ---

      const deferredKarmaPortRelease: DeferredPromise = new DeferredPromise();
      const deferredListenerSocketPortRelease: DeferredPromise = new DeferredPromise();
      const deferredDebugPortRelease: DeferredPromise = new DeferredPromise();

      const serverKarmaPort = await this.portManager.findAvailablePort(
        this.defaultKarmaPort,
        deferredKarmaPortRelease.promise()
      );

      this.logger.info(
        () => `Using requested --> available karma port: ${this.defaultKarmaPort} --> ${serverKarmaPort}`
      );

      const karmerListenerSocketPort = await this.portManager.findAvailablePort(
        this.defaultKarmaSocketConnectionPort,
        deferredListenerSocketPortRelease.promise()
      );

      this.logger.info(
        () =>
          'Using requested --> available karma listener socket port: ' +
          `${this.defaultKarmaSocketConnectionPort} --> ${karmerListenerSocketPort}`
      );

      const debugPort =
        this.defaultDebugPort !== undefined
          ? await this.portManager.findAvailablePort(this.defaultDebugPort, deferredDebugPortRelease.promise())
          : undefined;

      if (debugPort !== undefined) {
        this.logger.info(
          () => 'Using requested --> available debug port: ' + `${this.defaultDebugPort} --> ${debugPort}`
        );
      }

      // --- Start system (Karma server and listener) ---

      const karmaServerConnection: Execution = this.karmaEventListener.receiveKarmaConnection(karmerListenerSocketPort);
      const karmaServerExecution: Execution = this.testServer.start(
        serverKarmaPort,
        karmerListenerSocketPort,
        debugPort
      );

      this.notifications.notifyStatus(StatusType.Busy, 'Starting Karma...', futureReadyForTesting);

      // --- Handle Karma server events ---

      let isTerminationHandled = false;

      karmaServerExecution.done().then(exitReason => {
        let errorMsg = 'Karma server quit unexpectedly' + (exitReason ? `: ${exitReason}` : '');

        if (karmaServerExecution.started().isRejected()) {
          const startFailureReason = karmaServerExecution.started().reason();
          const failureMsg = (startFailureReason as Error).message ?? startFailureReason ?? '';
          errorMsg = 'Karma server failed to start' + (failureMsg ? `: ${failureMsg}` : '');
        }

        deferredReadyForTesting.reject(errorMsg);
        deferredKarmaPortRelease.fulfill();
        deferredDebugPortRelease.fulfill();

        if (!isTerminationHandled) {
          isTerminationHandled = true;

          this.handleSystemComponentTermination(
            'Karma server quit unexpectedly',
            errorMsg,
            karmaServerExecution,
            karmaServerConnection
          );
        }
      });

      // --- Handle Karma listener events ---

      karmaServerConnection
        .started()
        .then(() => deferredReadyForTesting.fulfill())
        .catch(failureReason => deferredReadyForTesting.reject(`${failureReason}`));

      karmaServerConnection.done().then(disconnectReason => {
        let errorMsg = 'Karma disconnected unexpectedly' + (disconnectReason ? `: ${disconnectReason}` : '');

        if (karmaServerConnection.isFailed()) {
          const connectionFailureReason = karmaServerConnection.failed().reason();
          errorMsg =
            'Karma disconnected unexpectedly' + (connectionFailureReason ? `: ${connectionFailureReason}` : '');
        }

        deferredReadyForTesting.reject(disconnectReason);
        deferredListenerSocketPortRelease.fulfill();

        if (!isTerminationHandled) {
          isTerminationHandled = true;

          this.handleSystemComponentTermination(
            'Karma disconnected unexpectedly',
            errorMsg,
            karmaServerExecution,
            karmaServerConnection
          );
        }
      });

      // --- Wait for system ready (Karma server up and listener connected) ---

      await futureReadyForTesting;

      this.currentServerStartInfo = {
        karmaPort: serverKarmaPort,
        karmaSocketPort: karmerListenerSocketPort,
        debugPort
      };

      return this.currentServerStartInfo;
    } catch (error) {
      this.logger.error(() => `${error}`);
      await this.stop();
      throw error;
    } finally {
      this.actionIsRunning = testActionWasRunning;
    }
  }

  public async discoverTests(): Promise<TestSuiteInfo> {
    const testActionWasRunning = this.actionIsRunning;
    const deferredTestDiscoveryCompletion = new DeferredPromise();

    try {
      this.actionIsRunning = true;

      if (!this.isStarted()) {
        this.logger.info(
          () =>
            'Test discovery request - ' +
            `karma server is ${!this.testServer.isRunning() ? 'not' : ''} running, and ` +
            `karma listener is ${!this.karmaEventListener.isRunning() ? 'not' : ''} running - ` +
            'Restarting both'
        );
        await this.restart();
      }
      this.logger.info(() => 'Discovering tests');
      this.notifications.notifyStatus(
        StatusType.Busy,
        'Discovering tests...',
        deferredTestDiscoveryCompletion.promise()
      );

      const karmaPort = this.testServer.getServerPort()!;
      const testSuiteInfo: TestSuiteInfo = await this.testRunner.discoverTests(karmaPort);
      const testCount = testSuiteInfo.testCount;

      this.logger.info(() => `Discovered ${testCount} total tests`);
      this.notifications.notifyStatus(StatusType.Done, `Discovered ${testCount} ${testCount === 1 ? 'test' : 'tests'}`);

      return testSuiteInfo;
    } catch (error) {
      const failureMessage = `Test discovery failed: ${error}`;
      this.logger.error(() => failureMessage);
      throw new Error(failureMessage);
    } finally {
      this.actionIsRunning = testActionWasRunning;
      deferredTestDiscoveryCompletion.fulfill();
    }
  }

  public async runTests(tests: (TestInfo | TestSuiteInfo)[]): Promise<void> {
    if (this.actionIsRunning) {
      this.logger.debug(() => 'Ignoring test run request - Another operation is currently running');
      return;
    }

    const deferredTestRunCompletion = new DeferredPromise();

    try {
      this.actionIsRunning = true;

      if (!this.isStarted()) {
        this.logger.info(
          () =>
            'Request to run tests - ' +
            `karma server is ${!this.testServer.isRunning() ? 'not' : ''} running, and ` +
            `karma listener is ${!this.karmaEventListener.isRunning() ? 'not' : ''} running - ` +
            'Restarting both'
        );

        await this.restart();
      }

      this.logger.info(() => 'Proceeding to run tests');
      this.notifications.notifyStatus(StatusType.Busy, 'Running tests...', deferredTestRunCompletion.promise());

      const karmaPort: number = this.testServer.getServerPort()!;
      const uniqueTests = this.removeTestOverlaps(tests);

      await this.testRunner.runTests(karmaPort, uniqueTests);

      this.notifications.notifyStatus(StatusType.Done, 'Done running tests');
    } finally {
      this.actionIsRunning = false;
      deferredTestRunCompletion.fulfill();
    }
  }

  public async stop(): Promise<void> {
    this.logger.info(() => 'Stopping test manager');

    const systemIsStoppingDeferred = new DeferredPromise<void>();
    this.systemCurrentlyStopping = systemIsStoppingDeferred.promise();

    this.notifications.notifyStatus(StatusType.Busy, 'Stopping Karma...', this.systemCurrentlyStopping);

    if (this.karmaEventListener.isRunning()) {
      this.logger.debug(() => 'Stopping karma event listener');
      await this.karmaEventListener.stop();
    } else {
      this.logger.debug(() => 'Karma event listener is already stopped');
    }

    if (this.testServer.isRunning()) {
      this.logger.debug(() => 'Stopping karma server');
      await this.testServer.stop();
    } else {
      this.logger.debug(() => 'Karma server is already stopped');
    }

    this.logger.info(() => 'Stopped test manager');
    systemIsStoppingDeferred.fulfill();
  }

  public isStarted(): boolean {
    return this.testServer.isRunning() && this.karmaEventListener.isRunning();
  }

  public isActionRunning(): boolean {
    return this.actionIsRunning;
  }

  private async handleSystemComponentTermination(
    simpleMessage: string,
    detailedMessage: string,
    ...componentExecutions: Execution[]
  ) {
    this.logger.debug(() => `Handling system component termination with message: ${simpleMessage ?? '<No message>'}`);

    if (this.systemCurrentlyStopping) {
      this.logger.debug(() => 'System stop was requested - Waiting for all components to stop');
      await RichPromise.allSettled(componentExecutions.map(execution => execution.ended()));

      this.currentServerStartInfo = undefined;
      this.systemCurrentlyStopping = undefined;
    } else if (!this.actionIsRunning) {
      this.logger.error(
        () =>
          `System stop was not requested - Showing status bar message with message: ${simpleMessage ?? '<No message>'}`
      );

      const showMessageAndOptions = () => {
        this.notifications.notify(MessageType.Warning, detailedMessage, [
          { label: 'Restart Karma', handler: { command: ExtensionCommands.Reload } }
        ]);
      };

      this.notifications.notifyStatus(StatusType.Warning, simpleMessage, undefined, {
        label: 'More Options',
        description: 'Click for more options',
        handler: showMessageAndOptions.bind(this)
      });
    }
  }

  private removeTestOverlaps(tests: (TestInfo | TestSuiteInfo)[]): (TestInfo | TestSuiteInfo)[] {
    const resolvedTests = new Set(tests);

    const removeDuplicates = (test: TestInfo | TestSuiteInfo) => {
      if (resolvedTests.has(test)) {
        resolvedTests.delete(test);
      }
      if (test.type === TestType.Suite) {
        test.children.forEach(childTest => removeDuplicates(childTest));
      }
    };

    tests.forEach(test => {
      if (resolvedTests.has(test) && test.type === TestType.Suite) {
        test.children.forEach(childTest => removeDuplicates(childTest));
      }
    });

    return [...resolvedTests];
  }

  public async dispose(): Promise<void> {
    await this.stop();
    await Disposer.dispose(this.disposables);
  }
}
