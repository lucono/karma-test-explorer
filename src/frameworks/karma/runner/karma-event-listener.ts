import { KarmaEvent } from "./karma-event";
import { KarmaEventName } from "./karma-event-name";
import { TestState } from "../../../core/test-state";
import { Logger } from "../../../core/logger";
import { TestRunEventEmitter } from "./test-run-event-emitter";
import { LightSpecCompleteResponse, SpecCompleteResponse } from "./spec-complete-response";
// import { Server as HttpServer, createServer} from "http"
// import { Server as SocketIOServer, ServerOptions, Socket} from "socket.io"
import { Execution } from "../../../api/execution";
import { TestStatus } from "../../../api/test-status";
import { Disposable } from "../../../api/disposable";
import { DeferredPromise } from "../../../util/deferred-promise";
import { SocketEventType, SocketMessage } from "../../../util/worker-socket";
import { Worker } from "worker_threads";
import { resolve } from "path";

// const DEFAULT_SOCKET_PORT = 9999;

const PING_INTERVAL = 24 * 60 * 60 * 1000;
const PING_TIMEOUT = 24 * 60 * 60 * 1000;

// export type TestCapture = { [key in TestStatus]: SpecCompleteResponse[] };
export type TestCapture = Record<TestStatus, SpecCompleteResponse[]>;

export class KarmaEventListener implements Disposable {
  private isListening: boolean = false;
  // private server: HttpServer | undefined;
  // private readonly sockets: Set<Socket> = new Set();
  private readonly socketWorker: Worker;

  private currentSpecs: string[] = [];
  private failedSpecs: SpecCompleteResponse[] = [];
  private passedSpecs: SpecCompleteResponse[] = [];
  private skippedSpecs: SpecCompleteResponse[] = [];
  private stopDeferred?: DeferredPromise<void>;

  public constructor(
    private readonly eventEmitter: TestRunEventEmitter,
    private readonly logger: Logger)
  {
    const socketWorkerScript: string = resolve(__dirname, '..', '..', 'util', 'worker-socket.js');
    const workerData = {
      pingTimeout: PING_TIMEOUT,
      pingInterval: PING_INTERVAL,
      isDebugMode: true
    };
    this.socketWorker = new Worker(socketWorkerScript, { workerData });
  }

  public receiveKarmaConnection(socketPort: number): Execution {
    const connectionClosedDeferred: DeferredPromise = new DeferredPromise();

    const connectionEstablishedPromise = new Promise<void>(async (resolve, reject) => {
      // if (this.isRunning()) {
      //   this.logger.info(
      //     `Request to open new karma listener connection on port ${socketPort} - ` +
      //     `Stopping currently running listener`);
        
      //   await this.stop();
      // }
      // this.logger.info(`Attempting to listen on port ${socketPort}`);

      const socketMessage: SocketMessage = {
        type: SocketEventType.Connect,
        event: 'connect',
        data: socketPort
      };
      this.socketWorker.postMessage(socketMessage);
  
      // const app = express();
      // const server = createServer(app);
      // this.server = server;
  
      // const socketServerOptions = {
      //   pingInterval: 24 * 60 * 60 * 1000,
      //   pingTimeout: 24 * 60 * 60 * 1000
      // } as ServerOptions;
  
      // const io = new SocketIOServer(server, socketServerOptions);
      // const socketPort = socketPort !== 0 ? socketPort : DEFAULT_SOCKET_PORT;
  
      // if (socketPort !== socketPort) {
      //   this.logger.info(`Invalid socket port specified '${socketPort}' - Using '${socketPort}' instead`);
      // }
      
      // this.logger.info(`Waiting on port ${socketPort} for Karma to connect...`);
      // let connectTimeoutId: ReturnType<typeof setTimeout>;

      this.socketWorker.on('message', (data: SocketMessage) => {
        if (data.type === SocketEventType.Disconnect) {
          connectionClosedDeferred.resolve();
          this.stopDeferred?.resolve();
          this.stopDeferred = undefined;

        } else if (data.type === SocketEventType.Data && data.event === KarmaEventName.BrowserConnected) {
          resolve();

        } else if (data.type === SocketEventType.Data && data.event === KarmaEventName.BrowserStart) {
          this.logger.info(`Karma Event Listener: Browser started`);
          this.clearCapturedSpecs();

        } else if (data.type === SocketEventType.Data && data.event === KarmaEventName.SpecComplete) {
          this.logger.debug(() => `Karma Event Listener: Test completed: ${JSON.stringify(data.data)}`);
          this.onSpecComplete(data.data);
        }
      });
    });

    const karmaConnection: Execution = {
      started: () => connectionEstablishedPromise,
      ended: () => connectionClosedDeferred.promise()
    };

    return karmaConnection;
  }

  public async listenForTests(testExecution: Execution, specs: string[] = []): Promise<TestCapture> {
    try {
      this.clearCapturedSpecs();
      this.currentSpecs = specs;
      this.isListening = true;

      const socketMessage: SocketMessage = {
        type: SocketEventType.Listen,
        event: 'listen',
        data: specs
      };
      this.socketWorker.postMessage(socketMessage);
  
      await testExecution.ended();

      const capturedTests: TestCapture = {
        [TestStatus.Failed]: this.failedSpecs,
        [TestStatus.Success]: this.passedSpecs,
        [TestStatus.Skipped]: this.skippedSpecs
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
    const results: LightSpecCompleteResponse = event.results;
    const testId: string = results.id;
    const fullName: string = [ ...results.suite, results.description ].join(" ");
    const specResults: SpecCompleteResponse = { ...results, fullName };
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

    this.eventEmitter.emitTestStateEvent(testId, TestState.Running); // FIXME: why emit consecutive running and result event
    this.eventEmitter.emitTestResultEvent(testId, specResults);

    if (testStatus === TestStatus.Success) {
      this.passedSpecs.push(specResults);
    } else if (testStatus === TestStatus.Failed) {
      this.failedSpecs.push(specResults);
    } else if (testStatus === TestStatus.Skipped) {
      this.skippedSpecs.push(specResults);
    }

    this.logger.status(specResults.status);
  }

  public async stop(): Promise<void> {
    const socketMessage: SocketMessage = {
      type: SocketEventType.Disconnect,
      event: 'disconnect'
    };
    this.socketWorker.postMessage(socketMessage);

    this.stopDeferred = new DeferredPromise();
    return this.stopDeferred.promise();
  }

  private clearCapturedSpecs() {
    this.passedSpecs = [];
    this.failedSpecs = [];
    this.skippedSpecs = [];
  }

  public isRunning(): boolean {
    return !this.stopDeferred?.isResolved() ?? false;
  }
  
  public dispose(): void {
    // FIXME: Pending impl
  }
}
