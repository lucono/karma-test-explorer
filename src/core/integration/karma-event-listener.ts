// import { TestInfo, TestSuiteInfo } from "vscode-test-adapter-api";
import { KarmaEvent } from "../../model/karma-event";
import { KarmaEventName } from "../../model/enums/karma-event-name.enum";
import { TestState } from "../../model/enums/test-state.enum";
import { Logger } from "../helpers/logger";
import { TestRunEventEmitter } from "../test-explorer/test-run-event-emitter";
import { SpecCompleteResponse } from "../../model/spec-complete-response";
import { Server as HttpServer, createServer} from "http"
import { Server as SocketIOServer, ServerOptions, Socket} from "socket.io"
import { Execution } from "../helpers/execution";
import { TestInfo } from "vscode-test-adapter-api";
import * as express from "express"

const DEFAULT_SOCKET_PORT = 9999;
const KARMA_CONNECT_TIMEOUT = 900_000;  // FIXME Read from config

export declare type TestRetriever = (testId: string) => TestInfo | undefined;

export class KarmaEventListener {
  private isListening: boolean = false;
  private acceptAllSpecs: boolean = false;
  private currentSpecs: string[] = [];
  private capturedSpecs: SpecCompleteResponse[] = [];
  private server: HttpServer | undefined;
  private readonly sockets: Set<Socket> = new Set();

  public constructor(
    private readonly eventEmitter: TestRunEventEmitter,
    private readonly testRetriever: TestRetriever,
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
          this.capturedSpecs = [];
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
        this.cleanupConnections();
      });

      connectTimeoutId = setTimeout(() => {
        this.logger.error(`Timeout after waiting ${KARMA_CONNECT_TIMEOUT} ms for Karma to connect on port ${port}`);
        reject(`Timeout after waiting ${KARMA_CONNECT_TIMEOUT} ms for Karma to connect`);
      }, KARMA_CONNECT_TIMEOUT);
    });
  }

  public async listenForTests(testExecution: Execution, specs: string[] = []): Promise<SpecCompleteResponse[]> {
    // this.currentRunId = testRunId;
    if (specs.length === 0) {
      this.acceptAllSpecs = true;
      this.currentSpecs = [];

    } else {
      this.acceptAllSpecs = false;
      this.currentSpecs = specs;
    }

    this.isListening = true;

    return new Promise((resolve, reject) => {
      testExecution.stopped
        .then(() => resolve(this.capturedSpecs))
        .catch((reason: any) => {
          this.logger.error(`Could not listen for Karma events - Test execution failed: ${reason}`);
          reject(reason);
        })
        .finally(() => {
          this.isListening = false;
          // this.currentRunId = undefined;
          this.capturedSpecs = [];
          this.currentSpecs = [];
          this.acceptAllSpecs = false;
        });
    });
  }

  private isIncludedSpec(specResult: SpecCompleteResponse): boolean {
    return this.acceptAllSpecs || this.currentSpecs.some(includedSpecName => {
      return specResult.fullName === includedSpecName || specResult.fullName.startsWith(includedSpecName);
    });
  }

  private onSpecComplete(event: KarmaEvent) {
    if (!this.isListening) {
      return;
    }
    const { results } = event;
    const testId = results.id;
    const isIncludedSpec = this.isIncludedSpec(results);
    const test: TestInfo | undefined = this.testRetriever(testId);

    if (isIncludedSpec) {
      const testOrId: TestInfo | string = test ?? testId;
      this.eventEmitter.emitTestStateEvent(testOrId, TestState.Running); // FIXME: why emit consecutive running and result event
      this.eventEmitter.emitTestResultEvent(testOrId, event);
      this.capturedSpecs.push(results);
      this.logger.status(results.status);
    }
  }

  public async stop(): Promise<void> {
    if (!this.isRunning()) {
      this.logger.info(`Request to stop karma listener - Listener not currently up`);
      return;
    }
    const server = this.server!;

    this.logger.info(`Karma Event Listener: Closing connection with karma`);

    return new Promise<void>((resolve, reject) => {
      server.close((error) => { // FIXME: Seems to be getting stuck here sometimes
        if (error) {
          this.logger.error(`Failed closing karma listener connection: ${error.message}`);
          reject();
          return;
        }
        this.logger.info(`Done closing karma listener connection`);
        resolve();
      });
    });
  }

  private cleanupConnections() {
    this.logger.info(`Karma Event Listener: Cleaning up connections`);
    try {
      this.sockets.forEach(socket => {
        socket.removeAllListeners();
        socket.disconnect(true);
      });
      
      this.sockets.clear();
      this.capturedSpecs = [];

    } catch (error) {
      this.logger.error(`Failure closing connection with karma: ${error}`);
    }
  }

  public isRunning(): boolean {
    return this.server !== undefined;
  }
}
