import RichPromise from 'bluebird';
import { TestInfo, TestSuiteInfo } from 'vscode-test-adapter-api';
import { ServerStartInfo, TestManager } from '../api/test-manager';
import { TestRunner } from '../api/test-runner';
import { TestServer } from '../api/test-server';
import { KarmaTestListener } from '../frameworks/karma/runner/karma-test-listener';
import { Disposable } from '../util/disposable/disposable';
import { Disposer } from '../util/disposable/disposer';
import { DeferredPromise } from '../util/future/deferred-promise';
import { Execution } from '../util/future/execution';
import { Logger } from '../util/logging/logger';
import { PortAcquisitionClient } from '../util/port/port-acquisition-client';
import { TestType } from './base/test-infos';
import { CancellationRequestedError } from './cancellation-requested-error';
import { Commands } from './vscode/commands/commands';
import { ProjectCommand } from './vscode/commands/project-command';
import { MessageType, NotificationHandler, StatusType } from './vscode/notifications/notification-handler';

export class DefaultTestManager implements TestManager {
  private disposables: Disposable[] = [];
  private actionIsRunning: boolean = false;
  private currentServerStartInfo?: ServerStartInfo;
  private systemCurrentlyStopping: Promise<void> | undefined;
  private systemFailure: Promise<void> | undefined;

  public constructor(
    private readonly testServer: TestServer,
    private readonly testRunner: TestRunner,
    private readonly karmaTestListener: KarmaTestListener,
    private readonly portAcquisitionClient: PortAcquisitionClient,
    private readonly defaultKarmaPort: number,
    private readonly defaultKarmaSocketConnectionPort: number,
    private readonly projectCommands: Commands<ProjectCommand>,
    private readonly notificationHandler: NotificationHandler,
    private readonly logger: Logger,
    private readonly defaultDebugPort?: number
  ) {
    this.disposables.push(testServer, testRunner, karmaTestListener, portAcquisitionClient, logger);
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
        this.logger.debug(
          () =>
            'Request to start test manager - test manager is still stopping. ' +
            'Waiting for stop operation to complete before proceeding to start'
        );

        await this.systemCurrentlyStopping;
      }

      if (this.isStarted()) {
        this.logger.debug(() => 'Request to start test manager ignored - test manager is already started');
        return this.currentServerStartInfo!;
      }

      const deferredReadyForTesting = new DeferredPromise();
      const futureReadyForTesting = deferredReadyForTesting.promise();

      // --- Stop system if currently running ---

      if (this.karmaTestListener.isRunning()) {
        this.logger.debug(() => 'Stopping currently running karma test event listener session');
        await this.karmaTestListener.stop();
      }

      if (this.testServer.isRunning()) {
        this.logger.info(() => 'Stopping currently running karma server');
        await this.testServer.stop();
      }

      // --- Acquire available ports for system re-execution ---

      const deferredKarmaPortRelease: DeferredPromise = new DeferredPromise();
      const deferredListenerSocketPortRelease: DeferredPromise = new DeferredPromise();
      const deferredDebugPortRelease: DeferredPromise = new DeferredPromise();

      const serverKarmaPort = await this.portAcquisitionClient.findAvailablePort(
        this.defaultKarmaPort,
        deferredKarmaPortRelease.promise()
      );

      this.logger.info(
        () => `Using requested --> available karma port: ${this.defaultKarmaPort} --> ${serverKarmaPort}`
      );

      const karmerListenerSocketPort = await this.portAcquisitionClient.findAvailablePort(
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
          ? await this.portAcquisitionClient.findAvailablePort(
              this.defaultDebugPort,
              deferredDebugPortRelease.promise()
            )
          : undefined;

      if (debugPort !== undefined) {
        this.logger.info(
          () => 'Using requested --> available debug port: ' + `${this.defaultDebugPort} --> ${debugPort}`
        );
      }

      // --- Start system (Karma server and listener) ---

      const karmaServerConnection: Execution = this.karmaTestListener.receiveKarmaConnection(karmerListenerSocketPort);

      const karmaServerExecution: Execution = this.testServer.start(
        serverKarmaPort,
        karmerListenerSocketPort,
        debugPort
      );

      this.notificationHandler.notifyStatus(StatusType.Busy, 'Starting Karma', futureReadyForTesting);

      // --- Handle Karma server events ---

      const serverExecutionFailure = karmaServerExecution.done().then(exitReason => {
        let errorMsg = 'Karma server quit unexpectedly' + (exitReason ? `: ${exitReason}` : '');

        if (karmaServerExecution.started().isRejected()) {
          const startFailureReason = karmaServerExecution.started().reason();
          const failureMsg = (startFailureReason as Error).message ?? startFailureReason ?? '';
          errorMsg = 'Karma server failed to start' + (failureMsg ? `: ${failureMsg}` : '');
        }

        deferredKarmaPortRelease.fulfill();
        deferredDebugPortRelease.fulfill();

        throw errorMsg;
      });

      // --- Handle Karma listener events ---

      karmaServerConnection.started().then(() => deferredReadyForTesting.fulfill());

      const karmaConnectionFailure = karmaServerConnection.done().then(disconnectReason => {
        let errorMsg = 'Karma disconnected unexpectedly' + (disconnectReason ? `: ${disconnectReason}` : '');

        if (karmaServerConnection.started().isRejected()) {
          const connectionFailureReason = karmaServerConnection.started().reason();
          const failureMsg = (connectionFailureReason as Error).message ?? connectionFailureReason ?? '';
          errorMsg = 'Karma server failed to connect' + (failureMsg ? `: ${failureMsg}` : '');
        }

        deferredListenerSocketPortRelease.fulfill();
        throw errorMsg;
      });

      const systemFailure = RichPromise.race([serverExecutionFailure, karmaConnectionFailure]);

      systemFailure.catch(async failureMsg => {
        const actionWasRunning = this.actionIsRunning;
        const wasOperationCancelled = !!this.systemCurrentlyStopping;
        const rejectionMsg = wasOperationCancelled ? 'Test operation was cancelled' : failureMsg;

        deferredReadyForTesting.reject(
          wasOperationCancelled ? new CancellationRequestedError(rejectionMsg) : new Error(rejectionMsg)
        );

        if (this.systemCurrentlyStopping) {
          this.logger.debug(() => 'System stop was requested - Waiting for all components to stop');
          await RichPromise.allSettled([karmaServerExecution.done(), karmaServerConnection.done()]);
          this.logger.debug(() => 'All components are done stopping');
        } else {
          this.logger.error(() => `System component terminated with message: ${failureMsg}`);

          this.logger.debug(
            () =>
              `${actionWasRunning ? 'Test action' : 'No test action'} in progress ` +
              `(System stop was not requested) - Initiating system stop`
          );

          await this.stop();
          this.logger.debug(() => 'System is done stopping');

          if (!actionWasRunning) {
            const showMessageAndOptions = () => {
              this.notificationHandler.notify(MessageType.Warning, rejectionMsg, [
                {
                  label: 'Restart Karma',
                  handler: { command: this.projectCommands.getCommandName(ProjectCommand.Reset) }
                }
              ]);
            };

            this.notificationHandler.notifyStatus(StatusType.Warning, rejectionMsg, undefined, {
              label: 'More Options',
              description: 'Click for more options',
              handler: showMessageAndOptions.bind(this)
            });
          }
        }

        this.currentServerStartInfo = undefined;
        this.systemFailure = undefined;
        this.systemCurrentlyStopping = undefined;
      });

      // --- Wait for system ready (Karma server up and listener connected) ---

      await futureReadyForTesting;

      this.currentServerStartInfo = {
        karmaPort: serverKarmaPort,
        karmaSocketPort: karmerListenerSocketPort,
        debugPort
      };

      this.systemFailure = systemFailure;

      return this.currentServerStartInfo;
    } catch (error: any) {
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
        this.logger.debug(
          () =>
            'Test discovery request - ' +
            `karma server is ${!this.testServer.isRunning() ? 'not' : ''} running, and ` +
            `karma listener is ${!this.karmaTestListener.isRunning() ? 'not' : ''} running - ` +
            'Restarting both'
        );
        await this.restart();
      }
      this.logger.info(() => 'Discovering tests');

      this.notificationHandler.notifyStatus(
        StatusType.Busy,
        'Discovering tests',
        deferredTestDiscoveryCompletion.promise()
      );

      const karmaPort = this.testServer.getServerPort()!;
      const futureTestDiscovery = this.testRunner.discoverTests(karmaPort);

      await RichPromise.race<TestSuiteInfo | void>([futureTestDiscovery, this.systemFailure]);

      const testSuiteInfo: TestSuiteInfo = await futureTestDiscovery;
      const testCount = testSuiteInfo.testCount;

      this.logger.debug(() => `Discovered ${testCount} total tests`);
      this.notificationHandler.notifyStatus(
        StatusType.Done,
        `Discovered ${testCount} ${testCount === 1 ? 'test' : 'tests'}`
      );

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
        this.logger.debug(
          () =>
            'Request to run tests - ' +
            `karma server is ${!this.testServer.isRunning() ? 'not' : ''} running, and ` +
            `karma listener is ${!this.karmaTestListener.isRunning() ? 'not' : ''} running - ` +
            'Restarting both'
        );

        await this.restart();
      }

      this.logger.debug(() => 'Proceeding to run tests');
      this.notificationHandler.notifyStatus(StatusType.Busy, 'Running tests', deferredTestRunCompletion.promise());

      const karmaPort: number = this.testServer.getServerPort()!;
      const uniqueTests = this.removeTestOverlaps(tests);

      const futureTestRunCompletion = this.testRunner.runTests(karmaPort, uniqueTests);
      await RichPromise.race([futureTestRunCompletion, this.systemFailure]);

      this.notificationHandler.notifyStatus(StatusType.Done, 'Done running tests');
    } finally {
      this.actionIsRunning = false;
      deferredTestRunCompletion.fulfill();
    }
  }

  public async stop(): Promise<void> {
    this.logger.debug(() => 'Stopping test manager');

    const systemIsStoppingDeferred = new DeferredPromise<void>();
    this.systemCurrentlyStopping = systemIsStoppingDeferred.promise();

    this.notificationHandler.notifyStatus(StatusType.Busy, 'Stopping Karma', this.systemCurrentlyStopping);

    if (this.karmaTestListener.isRunning()) {
      this.logger.debug(() => 'Stopping karma event listener');
      await this.karmaTestListener.stop();
    } else {
      this.logger.debug(() => 'Karma event listener is already stopped');
    }

    if (this.testServer.isRunning()) {
      this.logger.debug(() => 'Stopping karma server');
      await this.testServer.stop();
    } else {
      this.logger.debug(() => 'Karma server is already stopped');
    }

    this.logger.debug(() => 'Stopped test manager');
    systemIsStoppingDeferred.fulfill();
  }

  public isStarted(): boolean {
    return this.testServer.isRunning() && this.karmaTestListener.isRunning();
  }

  public isActionRunning(): boolean {
    return this.actionIsRunning;
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
