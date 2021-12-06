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
import { Disposable } from '../../../util/disposable/disposable';
import { Disposer } from '../../../util/disposable/disposer';
import { DeferredExecution } from '../../../util/future/deferred-execution';
import { DeferredPromise } from '../../../util/future/deferred-promise';
import { Execution } from '../../../util/future/execution';
import { SimpleLogger } from '../../../util/logging/simple-logger';
import { KarmaEvent, KarmaEventName } from './karma-event';
import { KarmaConnectionStatus, KarmaTestRunProcessor } from './karma-test-run-processor';
import { SpecCompleteResponse } from './spec-complete-response';

interface KarmaTestListenerOptions {
  readonly karmaReadyTimeout?: number;
}

export interface DebugStatusResolver {
  isDebugging: () => boolean;
}

export type TestCapture = Record<TestStatus, SpecCompleteResponse[]>;

export class KarmaTestListener implements Disposable {
  private server: HttpServer | undefined;
  private readonly sockets: Set<Socket> = new Set();
  private listenerCurrentlyStopping: Promise<void> | undefined;
  private disposables: Disposable[] = [];
  private readonly listenerOptions: Required<KarmaTestListenerOptions>;

  public constructor(
    private readonly testRunProcessor: KarmaTestRunProcessor,
    private readonly debugStatusResolver: DebugStatusResolver,
    private readonly logger: SimpleLogger,
    listenerOptions: KarmaTestListenerOptions = {}
  ) {
    this.listenerOptions = { karmaReadyTimeout: listenerOptions.karmaReadyTimeout || KARMA_READY_DEFAULT_TIMEOUT };
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

    // TODO: Switch to socket.io v4 API. Also, use `new SocketIOServer(socketPort, socketServerOptions)`
    const io = new SocketIOServer(server, socketServerOptions);

    io.on('connection', socket => {
      this.logger.info(() => `New socket connection from Karma on port ${socketPort}`);
      this.logger.debug(() => 'Listening for Karma events');

      this.sockets.add(socket);

      const onSocketDisconnect = (reason: string) => {
        const errorMsg = `Karma disconnected from socket with reason: ${reason}`;
        this.logger.debug(() => errorMsg);

        socket.removeAllListeners();
        this.sockets.delete(socket);

        const isAllConnectionsClosed = (this.server?.connections ?? 0) === 0;

        if (isAllConnectionsClosed) {
          this.testRunProcessor.captureTestError(errorMsg);
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

        const eventResult = this.testRunProcessor.captureTestEvent(
          eventName as KarmaEventName,
          ...(args as [KarmaEvent])
        );

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
      this.listenerOptions.karmaReadyTimeout,
      `Karma and browsers not ready after waiting ${this.listenerOptions.karmaReadyTimeout / 1000} secs`
    );

    return deferredKarmaConnectionExecution.execution();
  }

  public listenForTestDiscovery(testRunId: string): Execution<void, SpecCompleteResponse[]> {
    const testEventIntervalTimeout = this.debugStatusResolver.isDebugging()
      ? undefined
      : KARMA_TEST_EVENT_INTERVAL_TIMEOUT;

    return this.testRunProcessor.processTestRun(testRunId, [], {
      emitTestEvents: [],
      filterTestEvents: [],
      emitTestStats: false,
      testEventIntervalTimeout
    });
  }

  public listenForTestRun(testRunId: string, testNames: string[] = []): Execution<void, TestCapture> {
    const testCaptureDeferredExecution = new DeferredExecution<void, TestCapture>();

    const testEventIntervalTimeout = this.debugStatusResolver.isDebugging()
      ? undefined
      : KARMA_TEST_EVENT_INTERVAL_TIMEOUT;

    const specResultExecution = this.testRunProcessor.processTestRun(testRunId, testNames, {
      emitTestEvents: Object.values(TestStatus),
      filterTestEvents: [],
      emitTestStats: true,
      testEventIntervalTimeout
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
