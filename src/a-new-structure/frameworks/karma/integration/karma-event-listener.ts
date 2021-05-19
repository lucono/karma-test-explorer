import { KarmaEvent } from "./karma-event";
import { KarmaEventName } from "./karma-event-name";
import { TestState } from "../../../core/test-state";
import { Logger } from "../../../util/logger";
import { TestRunEventEmitter } from "./test-run-event-emitter";
import { SpecCompleteResponse } from "./spec-complete-response";
import { Server as HttpServer, createServer} from "http"
import { Server as SocketIOServer, ServerOptions, Socket} from "socket.io"
import { Execution } from "../../../api/execution";
import { TestResult } from "../../../../model/enums/test-status.enum";
import * as express from "express"

const DEFAULT_SOCKET_PORT = 9999;
const KARMA_CONNECT_TIMEOUT = 900_000;  // FIXME Read from config

export type TestCapture = { [key in TestResult]: SpecCompleteResponse[] };

export class KarmaEventListener {
  private isListening: boolean = false;
  private server: HttpServer | undefined;
  private readonly sockets: Set<Socket> = new Set();

  private currentSpecs: string[] = [];
  private failedSpecs: SpecCompleteResponse[] = [];
  private passedSpecs: SpecCompleteResponse[] = [];
  private skippedSpecs: SpecCompleteResponse[] = [];

  public constructor(
    private readonly eventEmitter: TestRunEventEmitter,
    private readonly logger: Logger
  ) {}

  public async acceptKarmaConnection(socketPort?: number): Promise<void> {
    if (this.isRunning()) {
      this.logger.info(
        `Request to open new karma listener connection on port ${socketPort} - ` +
        `Stopping currently running listener`);
      
      await this.stop();
    }
    this.logger.info(`Attempting to listen on port ${socketPort}`);

    return new Promise<void>((resolve, reject) => {
      const app = express();
      const server = createServer(app);
      this.server = server;
  
      const socketServerOptions = {
        pingInterval: 24 * 60 * 60 * 1000,
        pingTimeout: 24 * 60 * 60 * 1000
      } as ServerOptions;
  
      const io = new SocketIOServer(server, socketServerOptions);
      const port = socketPort !== 0 ? socketPort : DEFAULT_SOCKET_PORT;
  
      if (port !== socketPort) {
        this.logger.info(`Invalid socket port specified '${socketPort}' - Using '${port}' instead`);
      }
      
      this.logger.info(`Waiting on port ${port} for Karma to connect...`);
      let connectTimeoutId: ReturnType<typeof setTimeout>;

      io.on("connection", (socket) => {
        this.logger.info(`Karma Event Listener: New socket connection from Karma on port ${port}`);
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
          this.clearCapturedSpecs();
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

      server!.listen(port, () => {
        this.logger.info(`Karma Event Listener: Listening to KarmaReporter events on port ${port}`);
      });

      server!.on("close", () => {
        this.logger.info(`Karma Event Listener: Connection closed on ${port}`);
        clearTimeout(connectTimeoutId);
        this.server = undefined;
      });

      connectTimeoutId = setTimeout(() => {
        this.logger.error(`Timeout after waiting ${KARMA_CONNECT_TIMEOUT} ms for Karma to connect on port ${port}`);
        reject(`Timeout after waiting ${KARMA_CONNECT_TIMEOUT} ms for Karma to connect`);
      }, KARMA_CONNECT_TIMEOUT);
    });
  }

  public async listenForTests(testExecution: Execution, specs: string[] = []): Promise<TestCapture> {

    try {
      this.clearCapturedSpecs();
      this.currentSpecs = specs;
      this.isListening = true;

      await testExecution.stopped;

      const capturedTests: TestCapture = {
        [TestResult.Failed]: this.failedSpecs,
        [TestResult.Success]: this.passedSpecs,
        [TestResult.Skipped]: this.skippedSpecs
      };

      return capturedTests;

    } catch (error) {
      this.logger.error(`Could not listen for Karma events - Test execution failed: ${error.message ?? error}`);
      throw new Error(error.message ?? error);

    } finally {
      this.isListening = false;
      this.currentSpecs = [];
      this.clearCapturedSpecs();
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
    const { results } = event;
    const testId: string = results.id;
    const isIncludedSpec = this.isIncludedSpec(results);

    if (!isIncludedSpec) {
      this.logger.debug(() =>
        `Karma Event Listener: Skipping spec id '${results.id}' - ` +
        `Not part of current test run`);

      return;
    }
    this.eventEmitter.emitTestStateEvent(testId, TestState.Running); // FIXME: why emit consecutive running and result event
    this.eventEmitter.emitTestResultEvent(testId, event.results);

    const testResult: TestResult = results.status;

    if (testResult === TestResult.Success) {
      this.passedSpecs.push(results);
    } else if (testResult === TestResult.Failed) {
      this.failedSpecs.push(results);
    } else if (testResult === TestResult.Skipped) {
      this.skippedSpecs.push(results);
    }

    this.logger.status(results.status);
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

  private clearCapturedSpecs() {
    this.passedSpecs = [];
    this.failedSpecs = [];
    this.skippedSpecs = [];
  }

  private cleanupConnections() {
    this.logger.info(`Karma Event Listener: Cleaning up connections`);
    try {
      this.sockets.forEach(socket => {
        socket.removeAllListeners();
        socket.disconnect(true);
      });
      
      this.sockets.clear();
      this.clearCapturedSpecs();

    } catch (error) {
      this.logger.error(`Failure closing connection with karma: ${error}`);
    }
  }

  public isRunning(): boolean {
    return this.server !== undefined;
  }
}
