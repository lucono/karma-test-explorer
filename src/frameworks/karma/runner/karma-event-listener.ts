import { KarmaEvent } from "./karma-event";
import { KarmaEventName } from "./karma-event-name";
// import { TestState } from "../../../core/test-state";
import { Logger } from "../../../core/logger";
import { LightSpecCompleteResponse, SpecCompleteResponse } from "./spec-complete-response";
import { Server as HttpServer, createServer} from "http"
import { Server as SocketIOServer, ServerOptions, Socket} from "socket.io"
import { Execution } from "../../../api/execution";
import { TestStatus } from "../../../api/test-status";
import { Disposable } from "../../../api/disposable";
import { DeferredPromise } from "../../../util/deferred-promise";
import * as express from "express"
import { KarmaTestRunEventProcessor } from "./karma-test-run-event-processor";

// const DEFAULT_SOCKET_PORT = 9999;
const KARMA_CONNECT_TIMEOUT = 900_000;  // FIXME Read from config

// export type TestCapture = { [key in TestStatus]: SpecCompleteResponse[] };
export type TestCapture = Record<TestStatus, SpecCompleteResponse[]>;

export class KarmaEventListener implements Disposable {
  private isListening: boolean = false;
  private server: HttpServer | undefined;
  private readonly sockets: Set<Socket> = new Set();

  private currentSpecs: string[] = [];
  // private failedSpecs: Map<string, SpecCompleteResponse> = new Map();
  // private passedSpecs: Map<string, SpecCompleteResponse> = new Map();
  // private skippedSpecs: Map<string, SpecCompleteResponse> = new Map();

  public constructor(
    private readonly testRunEventProcessor: KarmaTestRunEventProcessor,
    private readonly logger: Logger
  ) {}

  public receiveKarmaConnection(socketPort: number): Execution {
    const connectionClosedDeferred: DeferredPromise = new DeferredPromise();

    const connectionEstablishedPromise = new Promise<void>(async (resolve, reject) => {
      if (this.isRunning()) {
        this.logger.info(
          `Request to open new karma listener connection on port ${socketPort} - ` +
          `Stopping currently running listener`);
        
        await this.stop();
      }
      this.logger.info(`Attempting to listen on port ${socketPort}`);
  
      const app = express();
      const server = createServer(app);
      this.server = server;
  
      const socketServerOptions = {
        pingInterval: 24 * 60 * 60 * 1000,
        pingTimeout: 24 * 60 * 60 * 1000
      } as ServerOptions;
  
      const io = new SocketIOServer(server, socketServerOptions);
      // const socketPort = socketPort !== 0 ? socketPort : DEFAULT_SOCKET_PORT;
  
      // if (socketPort !== socketPort) {
      //   this.logger.info(`Invalid socket port specified '${socketPort}' - Using '${socketPort}' instead`);
      // }
      
      this.logger.info(`Waiting on port ${socketPort} for Karma to connect...`);
      let connectTimeoutId: ReturnType<typeof setTimeout>;

      io.on("connection", (socket) => {
        this.logger.info(`Karma Event Listener: New socket connection from Karma on port ${socketPort}`);
        this.sockets.add(socket);

        socket.on(KarmaEventName.BrowserConnected, () => {
          if (connectTimeoutId !== undefined) {
            clearTimeout(connectTimeoutId);
          }
          this.logger.info(`Karma Event Listener: Browser connected`);
          resolve();
        });

        socket.on(KarmaEventName.BrowserError, (event: KarmaEvent) => {
          this.logger.info(`Karma Event Listener: Got browser error: ${JSON.stringify(event.results)}`);
        });

        socket.on(KarmaEventName.BrowserStart, () => {
          this.logger.info(`Karma Event Listener: Browser started`);
          // this.clearCapturedSpecs();
          this.testRunEventProcessor.beginProcessing();
        });

        socket.on(KarmaEventName.RunComplete, (event: KarmaEvent) => {
          this.logger.info(`Karma Event Listener: Test run completed: ${JSON.stringify(event)}`);
          // this.runCompleteEvent = event;
        });

        socket.on(KarmaEventName.SpecComplete, (event: KarmaEvent) => {
          this.logger.debug(() => `Karma Event Listener: Test completed: ${JSON.stringify(event)}`);
          this.onSpecComplete(event);
        });

        socket.on("disconnect", (reason: string) => {
          this.logger.info(`Karma Event Listener: Karma disconnected from socket with reason: ${reason}`);
          socket.removeAllListeners();
          this.sockets.delete(socket);
        });
      });

      server!.listen(socketPort, () => {
        this.logger.info(`Karma Event Listener: Listening to KarmaReporter events on port ${socketPort}`);
      });

      server!.on("close", () => {
        this.logger.info(`Karma Event Listener: Connection closed on ${socketPort}`);
        clearTimeout(connectTimeoutId);
        this.server = undefined;
        connectionClosedDeferred.resolve();
      });

      connectTimeoutId = setTimeout(() => {
        this.logger.error(`Timeout after waiting ${KARMA_CONNECT_TIMEOUT} ms for Karma to connect on port ${socketPort}`);
        reject(`Timeout after waiting ${KARMA_CONNECT_TIMEOUT} ms for Karma to connect`);
      }, KARMA_CONNECT_TIMEOUT);
    });

    const karmaConnection: Execution = {
      started: () => connectionEstablishedPromise,
      ended: () => connectionClosedDeferred.promise()
    };

    return karmaConnection;
  }

  public async listenForTests(testExecution: Execution, specs: string[] = []): Promise<TestCapture> {
    try {
      // this.clearCapturedSpecs();
      this.currentSpecs = specs;
      this.isListening = true;

      this.testRunEventProcessor.beginProcessing();
      await testExecution.ended();
      this.testRunEventProcessor.concludeProcessing();

      const capturedTests: TestCapture = {
        [TestStatus.Failed]: [],
        [TestStatus.Success]: [],
        [TestStatus.Skipped]: []
      };

      const processedSpecs: SpecCompleteResponse[] = this.testRunEventProcessor.getProcessedEvents();
      processedSpecs.forEach(processedSpec => capturedTests[processedSpec.status].push(processedSpec));

      // const capturedTests: TestCapture = {
      //   [TestStatus.Failed]: Array.from(this.failedSpecs.values()),
      //   [TestStatus.Success]: Array.from(this.passedSpecs.values()),
      //   [TestStatus.Skipped]: Array.from(this.skippedSpecs.values())
      // };

      return capturedTests;

    } catch (error) {
      this.logger.error(`Could not listen for Karma events - Test execution failed: ${error.message ?? error}`);
      throw new Error(error.message ?? error);

    } finally {
      this.isListening = false;
      this.currentSpecs = [];
      // this.clearCapturedSpecs();
    }
  }

  private isIncludedSpec(specResult: SpecCompleteResponse): boolean {
    const acceptAllSpecs = this.currentSpecs.length === 0;

    return acceptAllSpecs || this.currentSpecs.some(includedSpecName => {
      return specResult.fullName === includedSpecName || specResult.fullName.startsWith(includedSpecName);
    });
  }

  private onSpecComplete(event: KarmaEvent) {
    if (!this.isListening) {
      return;
    }
    const results: LightSpecCompleteResponse = event.results;
    const fullName: string = [ ...results.suite, results.description ].join(" ");
    const testId: string = results.id || `${results.filePath ?? ''}:${fullName}`;
    const specResults: SpecCompleteResponse = { ...results, id: testId, fullName };
    const isIncludedSpec = this.isIncludedSpec(specResults);

    if (!isIncludedSpec) {
      this.logger.debug(() =>
        `Karma Event Listener: Skipping spec id '${specResults.id}' - ` +
        `Not part of current test run`);

      return;
    }
    const testStatus: TestStatus = specResults.status;

    if (!Object.values(TestStatus).includes(testStatus)) {
      this.logger.warn(`Skipping captured spec with unknown result value: ${testStatus}`);
      this.logger.debug(() => `Skipped captured spec with unknown result '${testStatus}': ${specResults}`);
      return;
    }

    // this.testRunEventProcessor.processTestStateEvent(testId, TestState.Running); // FIXME: why emit consecutive running and result event
    this.testRunEventProcessor.processTestResultEvent(testId, specResults);

    // if (testStatus === TestStatus.Success) {
    //   this.passedSpecs.set(testId, specResults);
    // } else if (testStatus === TestStatus.Failed) {
    //   this.failedSpecs.set(testId, specResults);
    // } else if (testStatus === TestStatus.Skipped) {
    //   this.skippedSpecs.set(testId, specResults);
    // }

    this.logger.status(specResults.status);
  }

  public async stop(): Promise<void> {
    if (!this.isRunning()) {
      this.logger.info(`Request to stop karma listener - Listener not currently up`);
      return;
    }
    const server = this.server!;

    this.logger.info(`Karma Event Listener: Closing connection with karma`);

    return new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          this.logger.error(`Failed closing karma listener connection: ${error.message}`);
          reject();
          return;
        }
        this.logger.info(`Done closing karma listener connection`);
        resolve();
      });
      this.cleanupConnections();
    });
  }

  // private clearCapturedSpecs() {
  //   this.passedSpecs.clear();
  //   this.failedSpecs.clear();
  //   this.skippedSpecs.clear();
  // }

  private cleanupConnections() {
    this.logger.info(`Karma Event Listener: Cleaning up connections`);
    try {
      this.sockets.forEach(socket => {
        socket.removeAllListeners();
        socket.disconnect(true);
      });
      
      this.sockets.clear();
      // this.clearCapturedSpecs();

    } catch (error) {
      this.logger.error(`Failure closing connection with karma: ${error}`);
    }
  }

  public isRunning(): boolean {
    return this.server !== undefined;
  }
  
  public dispose(): void {
    // FIXME: Pending impl
  }
}
