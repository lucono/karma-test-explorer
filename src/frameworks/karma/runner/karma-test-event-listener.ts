import express from 'express';
import { createServer, Server as HttpServer } from 'http';
import { Server as SocketIOServer, ServerOptions, Socket } from 'socket.io';
import {
  KARMA_READY_DEFAULT_TIMEOUT,
  KARMA_SOCKET_PING_INTERVAL,
  KARMA_SOCKET_PING_TIMEOUT,
  KARMA_TEST_EVENT_INTERVAL_TIMEOUT
} from '../../../constants';
import { TestStatus } from '../../../core/base/test-status';
import { Notifications, StatusType } from '../../../core/vscode/notifications';
import { Disposable } from '../../../util/disposable/disposable';
import { Disposer } from '../../../util/disposable/disposer';
import { DeferredExecution } from '../../../util/future/deferred-execution';
import { DeferredPromise } from '../../../util/future/deferred-promise';
import { Execution } from '../../../util/future/execution';
import { SimpleLogger } from '../../../util/logging/simple-logger';
import { MultiEventHandler } from '../../../util/multi-event-handler';
import { KarmaAutoWatchTestEventProcessor } from './karma-auto-watch-test-event-processor';
import { KarmaEvent, KarmaEventName } from './karma-event';
import { KarmaTestEventProcessor, TestEventProcessingOptions } from './karma-test-event-processor';
import { LightSpecCompleteResponse, SpecCompleteResponse } from './spec-complete-response';
import { TestRunStatus } from './test-run-status';

enum KarmaConnectionStatus {
  Started,
  Ended,
  Failed
}

interface KarmaEventResult {
  connectionStatus: KarmaConnectionStatus;
  error?: string;
}

interface TestCaptureSession {
  readonly testRunId: string;
  readonly testNames: string[];
  readonly testEventProcessingOptions: TestEventProcessingOptions;
  readonly testRunStarted: (testRunId?: string) => void;
  readonly testRunEnded: (testRunId?: string) => void;
}

export type TestCapture = Record<TestStatus, SpecCompleteResponse[]>;

export class KarmaTestEventListener implements Disposable {
  private server: HttpServer | undefined;
  private readonly sockets: Set<Socket> = new Set();
  private listenerCurrentlyStopping: Promise<void> | undefined;
  private readonly karmaReadyTimeout: number;
  private currentTestCaptureSession?: TestCaptureSession;
  private disposables: Disposable[] = [];

  public constructor(
    private readonly testEventProcessor: KarmaTestEventProcessor,
    private readonly watchModeTestEventProcessor: KarmaAutoWatchTestEventProcessor | undefined,
    karmaReadyTimeout: number,
    private readonly notifications: Notifications,
    private readonly logger: SimpleLogger
  ) {
    this.karmaReadyTimeout = karmaReadyTimeout > 0 ? karmaReadyTimeout : KARMA_READY_DEFAULT_TIMEOUT;
    this.disposables.push(logger);
  }

  public receiveKarmaConnection(socketPort: number): Execution {
    if (this.isRunning()) {
      throw new Error(
        `Request to open new karma listener connection on port ${socketPort} rejected - ` +
          'An existing connection is still open'
      );
    }

    this.logger.debug(() => `Attempting to listen on port ${socketPort}`);

    const deferredKarmaConnectionExecution = new DeferredExecution();
    const app = express();
    const server = createServer(app);
    this.server = server;

    const socketServerOptions: Partial<ServerOptions> = {
      pingInterval: KARMA_SOCKET_PING_INTERVAL,
      pingTimeout: KARMA_SOCKET_PING_TIMEOUT
    };

    // TODO: Switch to socket.io v4 API. Also, use `new SocketIOServer(socketPort, socketServerOptions);`
    const io = new SocketIOServer(server, socketServerOptions);

    io.on('connection', socket => {
      this.logger.info(() => `New socket connection from Karma on port ${socketPort}`);
      this.logger.debug(() => 'Listening for Karma events');

      this.sockets.add(socket);
      const receivedEventsHandler = this.getKarmaEventHandler();

      const onSocketDisconnect = (reason: string) => {
        const errorMsg = `Karma disconnected from socket with reason: ${reason}`;
        this.logger.debug(() => errorMsg);

        socket.removeAllListeners();
        this.sockets.delete(socket);

        const isAllConnectionsClosed = (this.server?.connections ?? 0) === 0;

        if (isAllConnectionsClosed) {
          this.processTestErrorEvent(errorMsg);
          deferredKarmaConnectionExecution.end();
        }
      };

      socket.onAny((eventName: string, ...args: unknown[]) => {
        this.logger.debug(() => `Received Karma event: ${eventName}`);
        this.logger.trace(() => `Data for received Karma event '${eventName}': ${JSON.stringify(args, null, 2)}`);

        if (eventName === 'disconnect') {
          onSocketDisconnect(...(args as [string]));
          return;
        }

        const eventResult = receivedEventsHandler.handleEvent(eventName as KarmaEventName, ...(args as [KarmaEvent]));

        if (!eventResult) {
          return;
        }

        if (eventResult.connectionStatus === KarmaConnectionStatus.Started) {
          deferredKarmaConnectionExecution.start();
          return;
        }

        if ([KarmaConnectionStatus.Ended, KarmaConnectionStatus.Failed].includes(eventResult.connectionStatus)) {
          const stopListener = async () => {
            if (this.listenerCurrentlyStopping) {
              await this.listenerCurrentlyStopping;
            } else if (this.isRunning()) {
              this.stop();
            }
          };

          stopListener().then(() => {
            if (eventResult.connectionStatus === KarmaConnectionStatus.Ended) {
              deferredKarmaConnectionExecution.end();
            } else if (eventResult.connectionStatus === KarmaConnectionStatus.Failed) {
              deferredKarmaConnectionExecution.fail(eventResult.error ?? 'Karma connection failed');
            }
          });
        }
      });
    });

    server!.listen(socketPort, () => {
      this.logger.info(() => `Waiting on port ${socketPort} for Karma to connect`);
    });

    server!.on('close', () => {
      this.logger.debug(() => `Karma connection closed on port ${socketPort}`);

      if (this.server === server) {
        this.server = undefined;
        this.listenerCurrentlyStopping = undefined;
      }
      deferredKarmaConnectionExecution.end();
    });

    deferredKarmaConnectionExecution.failIfNotStarted(
      this.karmaReadyTimeout,
      `Karma and browsers not ready after waiting ${this.karmaReadyTimeout / 1000} secs`
    );

    return deferredKarmaConnectionExecution.execution();
  }

  private processTestErrorEvent(errorMsg: string) {
    this.logger.debug(() => `Test error processing requested with message: ${errorMsg}`);

    if (this.testEventProcessor?.isProcessing()) {
      this.logger.debug(() => `Sending test error event to test event processor with message: ${errorMsg}`);
      this.testEventProcessor.processTestErrorEvent(errorMsg);
    }
    if (this.watchModeTestEventProcessor?.isProcessing()) {
      this.logger.debug(() => `Sending test error event to watch mode test event processor with message: ${errorMsg}`);
      this.watchModeTestEventProcessor?.processTestErrorEvent(errorMsg);
    }
  }

  public listenForTestDiscovery(testRunId: string): Execution<string, SpecCompleteResponse[]> {
    return this.listenForTests(testRunId, [], {
      emitTestEvents: [],
      filterTestEvents: [],
      emitTestStats: false,
      testEventIntervalTimeout: KARMA_TEST_EVENT_INTERVAL_TIMEOUT
    });
  }

  public listenForTestRun(testRunId: string, testNames: string[] = []): Execution<string, TestCapture> {
    const testCaptureDeferredExecution = new DeferredExecution<string, TestCapture>();

    const specResultExecution = this.listenForTests(testRunId, testNames, {
      emitTestEvents: Object.values(TestStatus),
      filterTestEvents: [],
      emitTestStats: true,
      testEventIntervalTimeout: KARMA_TEST_EVENT_INTERVAL_TIMEOUT
    });

    specResultExecution.started().then(testRunId => testCaptureDeferredExecution.start(testRunId));

    specResultExecution.ended().then(capturedSpecs => {
      const capturedTests: TestCapture = {
        [TestStatus.Failed]: [],
        [TestStatus.Success]: [],
        [TestStatus.Skipped]: []
      };

      capturedSpecs.forEach(processedSpec => capturedTests[processedSpec.status].push(processedSpec));
      testCaptureDeferredExecution.end(capturedTests);
    });

    specResultExecution.failed().then(failureReason => testCaptureDeferredExecution.fail(failureReason));

    return testCaptureDeferredExecution.execution();
  }

  private listenForTests(
    testRunId: string,
    testNames: string[],
    testEventProcessingOptions: TestEventProcessingOptions
  ): Execution<string, SpecCompleteResponse[]> {
    const deferredSpecCaptureExecution = new DeferredExecution<string, SpecCompleteResponse[]>();
    const futureSpecCaptureExecution = deferredSpecCaptureExecution.execution();

    const testRunStartHandler = (startedTestRunId?: string) => {
      if (startedTestRunId !== testRunId) {
        this.logger.debug(
          () =>
            `New test run starting with id '${startedTestRunId}' ` +
            `is not for the current requested test run Id: ${testRunId}`
        );
        return;
      }
      this.logger.debug(() => `Test run starting for requested test run Id: ${testRunId}`);

      if (this.testEventProcessor.isProcessing()) {
        this.logger.warn(
          () =>
            `New requested test run with run id '${startedTestRunId}' ` +
            `is starting while another one with same Id is already in progress - ` +
            `Continuing with existing test`
        );
        return;
      }
      this.logger.debug(() => `Starting test capture session for current requested test run Id: ${testRunId}`);

      deferredSpecCaptureExecution.start(testRunId);
      const futureProcessingResults = this.testEventProcessor.processTestEvents(testNames, testEventProcessingOptions);

      futureProcessingResults.then(processingResults => {
        deferredSpecCaptureExecution.end(processingResults.processedSpecs);
      });

      futureProcessingResults.catch(failureReason => {
        this.logger.error(() => `Could not listen for Karma events - Test execution failed: ${failureReason}`);
        deferredSpecCaptureExecution.fail(failureReason);
      });
    };

    const testRunEndHandler = (endedTestRunId?: string) => {
      if (endedTestRunId !== testRunId) {
        this.logger.debug(
          () =>
            `Test run ending now with test run Id '${endedTestRunId}' ` +
            `is not for the current requested test run Id: ${testRunId}`
        );
        return;
      }
      this.logger.debug(() => `Test run ending for current requested test run Id: ${testRunId}`);

      if (!this.testEventProcessor.isProcessing()) {
        this.logger.warn(
          () =>
            `Test run ending now with test run Id '${endedTestRunId}' while ` +
            `current requested test run with same Id is not currently processing - ` +
            `Ignoring test run end event`
        );
        return;
      }
      this.logger.debug(() => `Ending test capture session for current requested test run Id: ${testRunId}`);
      this.testEventProcessor.concludeProcessing();
    };

    this.currentTestCaptureSession = {
      testRunId,
      testNames,
      testEventProcessingOptions,
      testRunStarted: testRunStartHandler,
      testRunEnded: testRunEndHandler
    };

    futureSpecCaptureExecution.done().then(() => {
      this.logger.debug(() => `Done listening for test run Id: ${testRunId}`);
      this.currentTestCaptureSession = undefined;
    });

    this.logger.debug(() => `Started listening for test run Id: ${testRunId}`);
    return deferredSpecCaptureExecution.execution();
  }

  public async stop(): Promise<void> {
    if (!this.isRunning()) {
      this.logger.debug(() => 'Request to stop karma listener - Listener not currently running');
      return;
    }

    if (this.listenerCurrentlyStopping) {
      this.logger.debug(() => 'Request to stop karma listener - Listener is still stopping');
      await this.listenerCurrentlyStopping;
      return;
    }
    const listenerIsStoppingDeferred = new DeferredPromise<void>();
    this.listenerCurrentlyStopping = listenerIsStoppingDeferred.promise();

    const server = this.server!;

    this.logger.debug(() => 'Closing connection with karma');

    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error) {
          this.logger.error(() => `Failed closing karma listener connection: ${error.message}`);
          reject();
          return;
        }
        this.logger.debug(() => 'Done closing karma listener connection');
        resolve();
        listenerIsStoppingDeferred.fulfill();
      });

      this.cleanupConnections();
    });
  }

  private getKarmaEventHandler(): MultiEventHandler<KarmaEventName, (event: KarmaEvent) => KarmaEventResult | void> {
    const karmaEventHandler: MultiEventHandler<KarmaEventName, (eventData: KarmaEvent) => KarmaEventResult | void> =
      new MultiEventHandler(new SimpleLogger(this.logger, MultiEventHandler.name));

    karmaEventHandler.setDefaultHandler(event => {
      const isErrorEvent = event.name?.toLowerCase().includes('error');

      if (isErrorEvent) {
        this.logger.debug(() => `Received unregistered error event: ${event.name}`);
        this.logger.trace(
          () => `Data for received unregistered error event '${event.name}': ${JSON.stringify(event, null, 2)}`
        );

        this.processTestErrorEvent(`Error event: ${event.name}`);

        if (this.watchModeTestEventProcessor?.isProcessing()) {
          this.watchModeTestEventProcessor?.concludeProcessing();
        }
      } else {
        this.logger.debug(() => `Ignoring received karma event: ${event.name}`);
        this.logger.trace(() => `Data for ignored event '${event.name}': ${JSON.stringify(event, null, 2)}`);
      }
    });

    karmaEventHandler.setErrorHandler((eventName: KarmaEventName, error: Error, event: KarmaEvent) => {
      this.logger.error(() => `Error while handling received karma event '${eventName}': ${error}`);
      this.logger.trace(
        () => `Event data for received errored event '${eventName}': ${JSON.stringify(event, null, 2)}`
      );
    });

    karmaEventHandler.setEventHandler(KarmaEventName.Listening, event => {
      this.logger.debug(() => `Karma server on karma port ${event.port ?? '<unknown>'} is ready for requests`);
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    karmaEventHandler.setEventHandler(KarmaEventName.BrowsersReady, _event => {
      this.logger.debug(() => 'Browsers connected and ready for test execution');
      return { connectionStatus: KarmaConnectionStatus.Started };
    });

    karmaEventHandler.setEventHandler(KarmaEventName.RunStart, event => {
      const browserNames = event.browsers?.map(browser => browser.name)?.join(', ');
      this.logger.debug(() => `Test run started for browsers: ${browserNames ?? 'unknown'}`);

      if (this.watchModeTestEventProcessor?.isProcessing()) {
        this.watchModeTestEventProcessor.processTestErrorEvent('New test is starting');
      }
      this.currentTestCaptureSession?.testRunStarted(event.runId);

      if (!this.testEventProcessor.isProcessing() && this.watchModeTestEventProcessor) {
        const futureWatchModeProcessingCompletion = this.watchModeTestEventProcessor.beginProcessing();

        this.notifications.notifyStatus(
          StatusType.Busy,
          'Watch mode running tests in background...',
          futureWatchModeProcessingCompletion
        );
      }
    });

    karmaEventHandler.setEventHandler(KarmaEventName.BrowserStart, event => {
      this.logger.debug(() => `Test run started in browser: ${event.browser?.name ?? 'unknown'}`);
    });

    karmaEventHandler.setEventHandler(KarmaEventName.SpecComplete, event => {
      const eventProcessor = this.testEventProcessor.isProcessing()
        ? this.testEventProcessor
        : this.watchModeTestEventProcessor?.isProcessing()
        ? this.watchModeTestEventProcessor
        : undefined;

      if (!eventProcessor?.isProcessing()) {
        this.logger.debug(
          () =>
            `Not processing received spec id '${event.results?.id ?? '<none>'}' - ` +
            `Neither the test run nor watch mode test processors are currently active`
        );
        return;
      }

      const results: LightSpecCompleteResponse = event.results!;
      const fullName: string = [...results.suite, results.description].join(' ');
      const testId: string = results.id || `${results.filePath ?? ''}:${fullName}`;
      const specResults: SpecCompleteResponse = { ...results, id: testId, fullName };
      const testStatus: TestStatus = specResults.status;
      const browserName = `${event.browser?.name ?? '(Unknwon browser)'}`;

      this.logger.debug(
        () =>
          `Processing received spec id '${event.results?.id ?? '<none>'}' ` +
          `with test processor: ${eventProcessor.constructor.name}`
      );

      eventProcessor.processTestResultEvent(specResults);

      const statusMsg =
        testStatus === TestStatus.Success
          ? `[SUCCESS] ✅ Passed - ${browserName}`
          : testStatus === TestStatus.Failed
          ? `[FAILURE] ❌ failed - ${browserName}`
          : `[SKIPPED] Test Skipped - ${browserName}`;

      this.logger.debug(() => statusMsg);
    });

    karmaEventHandler.setEventHandler(KarmaEventName.BrowserComplete, event => {
      this.logger.debug(() => `Test run completed in browser: ${event.browser?.name ?? 'unknown'}`);
    });

    karmaEventHandler.setEventHandler(KarmaEventName.RunComplete, event => {
      const browserNames = event.browsers?.map(browser => browser.name)?.join(', ');
      this.logger.debug(
        () =>
          `Test run completed with status '${event.runStatus ?? 'unknown'}' ` +
          `for browsers: ${browserNames ?? 'unknown'}`
      );

      const testRunStatus = event.runStatus ?? TestRunStatus.Complete;

      const errorMsg =
        testRunStatus === TestRunStatus.Error
          ? 'Test run encountered an error'
          : testRunStatus === TestRunStatus.Timeout
          ? 'Test run timed out'
          : undefined;

      if (errorMsg) {
        this.processTestErrorEvent(errorMsg);
        return;
      }

      if (this.currentTestCaptureSession) {
        this.currentTestCaptureSession.testRunEnded(event.runId);
      } else {
        this.logger.debug(
          () => `Received '${event.name}' event with run Id '${event.runId}' while no requested user test capture`
        );
      }

      if (this.watchModeTestEventProcessor?.isProcessing()) {
        this.watchModeTestEventProcessor.concludeProcessing();
      }
    });

    karmaEventHandler.setEventHandler(KarmaEventName.BrowserError, event => {
      this.logger.trace(
        () =>
          `For browser: ${event.browser?.fullName ?? 'unknown'}\n` +
          `---> Received Karma event: ${JSON.stringify(event, null, 2)}`
      );
      const errorMsg = event.error ? `Browser Error - ${event.error}` : 'Browser Error';
      this.logger.error(() => `Browser error while listening for test events: ${errorMsg}`);

      this.processTestErrorEvent(errorMsg);

      if (!event.error?.toLowerCase()?.includes('(transport close)')) {
        return;
      }

      return {
        connectionStatus: KarmaConnectionStatus.Failed,
        error: errorMsg
      };
    });

    karmaEventHandler.setEventHandler(KarmaEventName.BrowserProcessFailure, event => {
      const errorMsg = event.error ? `Browser Failure - ${event.error}` : 'Browser Failure';
      this.logger.error(() => `Failure while listening for test events: ${errorMsg}`);

      this.processTestErrorEvent(errorMsg);

      return {
        connectionStatus: KarmaConnectionStatus.Failed,
        error: errorMsg
      };
    });

    karmaEventHandler.setEventHandler(KarmaEventName.Exit, () => {
      const exitMsg = 'Karma exited';
      this.logger.debug(() => exitMsg);

      this.processTestErrorEvent(exitMsg);

      return {
        connectionStatus: KarmaConnectionStatus.Failed,
        error: exitMsg
      };
    });

    return karmaEventHandler;
  }

  private cleanupConnections() {
    this.logger.info(() => 'Cleaning up connections');
    try {
      this.sockets.forEach(socket => {
        socket.removeAllListeners();
        socket.disconnect(true);
      });

      this.sockets.clear();
    } catch (error) {
      this.logger.error(() => `Failure closing connection with karma: ${error}`);
    }
  }

  public isRunning(): boolean {
    return this.server !== undefined;
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
