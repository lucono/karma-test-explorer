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
const KARMA_CONNECT_TIMEOUT = 300000;

export declare type TestRetriever = (testId: string) => TestInfo | undefined;

export class KarmaEventListener {
  // public lastRunTest: string = "";
  // public testStatus: TestResult | undefined;
  // public runCompleteEvent: KarmaEvent | undefined;
  // public isComponentRun: boolean = false;

  private isListening: boolean = false;
  private acceptAllSpecs: boolean = false;
  // private currentRunId?: string;
  private currentSpecs: string[] = []; // Array<TestInfo | TestSuiteInfo> = [];
  private capturedSpecs: SpecCompleteResponse[] = [];
  private server: HttpServer | undefined;
  private readonly sockets: Set<Socket> = new Set();

  public constructor(
    private readonly eventEmitter: TestRunEventEmitter,
    private readonly testRetriever: TestRetriever,
    private readonly logger: Logger
  ) {}

  public acceptKarmaConnection(socketPort?: number): Promise<void> {
    this.closeKarmaConnection();

    return new Promise<void>((resolve, reject) => {
      this.logger.info(`Karma Event Listener: Listen for new connection requested with port '${socketPort}'`);
  
      const app = express();
      const server = createServer(app);
      this.server = server;
  
      const socketServerOptions = {
        // forceNew: true,
        pingInterval: 24 * 60 * 60 * 1000,
        pingTimeout: 24 * 60 * 60 * 1000
      } as ServerOptions;
  
      const io = new SocketIOServer(server, socketServerOptions);
      const port = socketPort !== 0 ? socketPort : DEFAULT_SOCKET_PORT;
  
      if (port !== socketPort) {
        this.logger.info(`Invalid socket port specified '${socketPort}' - Using '${port}' instead`);
      }
      
      this.logger.info(`Waiting to connect to Karma...`);
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
          this.logger.info(`Karma Event Listener: Got browser error: ${event.results}`);
        });

        socket.on(KarmaEventName.BrowserStart, () => {
          this.logger.info(`Karma Event Listener: Browser started`);
          this.capturedSpecs = [];
        });

        socket.on(KarmaEventName.RunComplete, (event: KarmaEvent) => {
          this.logger.info(`Karma Event Listener: Test run completed: ${event}`);
          // this.runCompleteEvent = event;
        });

        socket.on(KarmaEventName.SpecComplete, (event: KarmaEvent) => {
          this.logger.debug(`Karma Event Listener: Test completed: ${event}`);
          this.onSpecComplete(event);
        });

        socket.on("disconnect", (reason: string) => {
          this.logger.info(`Karma Event Listener: Karma disconnected from socket with reason: ${reason}`);
        });
      });

      server!.listen(port, () => {
        this.logger.info(`Karma Event Listener: Listening to KarmaReporter events on port ${port}`);
      });

      server!.on("close", () => {
        this.logger.info(`Karma Event Listener: Connection closed on ${port}`);
        clearTimeout(connectTimeoutId);
      });

      connectTimeoutId = setTimeout(() => {
        this.logger.error(`Timeout after waiting ${KARMA_CONNECT_TIMEOUT} ms for Karma to connect on port ${port}`);
        reject(`Timeout after waiting ${KARMA_CONNECT_TIMEOUT} ms for Karma to connect`);
      }, KARMA_CONNECT_TIMEOUT);
    });
  }

  public async listenForAllSpecs(testExecution: Execution): Promise<SpecCompleteResponse[]> {
    // this.currentRunId = testRunId;
    this.acceptAllSpecs = true;
    this.currentSpecs = [];
    return this.listen(testExecution);
  }

  public async listenForSpecs(specs: string[], testExecution: Execution): Promise<SpecCompleteResponse[]> {
    // this.currentRunId = testRunId;
    this.acceptAllSpecs = false;
    this.currentSpecs = specs;
    return this.listen(testExecution);
  }

  private async listen(testExecution: Execution): Promise<SpecCompleteResponse[]> {
    this.isListening = true;

    return new Promise((resolve, reject) => {
      testExecution.onStop
        .then(() => resolve(this.capturedSpecs))
        .catch((reason: any) => {
          this.logger.error(`Could not listen for Karma events - Test execution failed: ${reason}`);
          reject(reason);
        })
        .finally(() => {
          this.isListening = false;
          this.capturedSpecs = [];
          // this.currentRunId = undefined;
          this.currentSpecs = [];
          this.acceptAllSpecs = false;
        });
    });
  }

  // public async listenForTestRun(testExecution: Execution<any, Array<TestInfo | TestSuiteInfo>>): Promise<SpecCompleteResponse[]> {
  //   this.runningTests = testExecution.executionData;

  //   return new Promise((resolve, reject) => {
  //     testExecution.futureCompletion
  //       .then(() => resolve(this.capturedSpecs))
  //       .catch(reason => {
  //         this.logger.error(`Could not listen for Karma events - Test execution failed: ${reason}`);
  //         reject(reason);
  //       })
  //       .finally(() => {
  //         this.capturedSpecs = [];
  //         this.runningTests = undefined;
  //       });
  //   });
  // }

  // private getLoadedTests(pathFinder: PathFinder): TestSuiteInfo {
  //   const specToTestSuiteMapper = new SpecResponseToTestSuiteInfoMapper(pathFinder);
  //   return specToTestSuiteMapper.map(this.capturedSpecs);
  // }

  private isIncludedSpec(specResult: SpecCompleteResponse): boolean {
    // return this.acceptAllSpecs || this.currentSpecs.some(includedSpec => {
    //   return specResult.fullName === includedSpec.fullName || specResult.fullName.startsWith(includedSpec.fullName);
    // });

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

  // private onSpecComplete(event: KarmaEvent) {
  //   if (!this.isListening) {
  //     return;
  //   }
  //   const results = { ...event.results };
  //   const patchedEvent = { name: event.name, results };
  //   const testId = results.id;
  //   const isIncludedSpec = this.isIncludedSpec(results);
  //   const test: TestInfo | undefined = this.testRetriever(testId);

  //   if (test && !results.filePath) {
  //     results.filePath = test.file;
  //     results.line = test.line;
  //   }

  //   if (isIncludedSpec) {
  //     const testOrId: TestInfo | string = test ?? testId;
  //     this.eventEmitter.emitTestStateEvent(testOrId, TestState.Running); // FIXME: why emit consecutive running and result event
  //     this.eventEmitter.emitTestResultEvent(testOrId, patchedEvent);
  //     this.capturedSpecs.push(results);

  //     const testStatus = results.status;
  //     this.logger.status(testStatus as TestResult);
  //   }
  // }

  public closeKarmaConnection(): void {
    try {
      this.sockets.forEach(socket => {
        socket.removeAllListeners();
        socket.disconnect(true);
      });
      
      this.sockets.clear();
      this.server?.close();
      this.server = undefined;
      this.capturedSpecs = [];

    } catch (error) {
      this.logger.error(`${error}`);
    }
  }

  // private setServerInfo(server: HttpServer) {
  //   this.server = server;
  //   // this.serverDisconnectRequested = false;
  // }

  // private clearServerInfo(server: HttpServer) {
  //   if (this.server && this.server === server) {
  //     this.server = undefined;
  //   }
  // }

  // public isConnected(): boolean {
  //   return this.server !== undefined;
  // }
}
