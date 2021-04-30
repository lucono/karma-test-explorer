import { TestSuiteInfo } from "vscode-test-adapter-api";
import { SpecResponseToTestSuiteInfoMapper } from "../../core/test-explorer/spec-response-to-test-suite-info.mapper";
import { KarmaEvent } from "../../model/karma-event";
import { KarmaEventName } from "../../model/enums/karma-event-name.enum";
import { TestState } from "../../model/enums/test-state.enum";
import { Logger } from "../helpers/logger";
import { EventEmitter } from "../helpers/event-emitter";
import { TestResult } from "../../model/enums/test-status.enum";
import { PathFinder } from "../helpers/path-finder";
import { SpecCompleteResponse } from "../../model/spec-complete-response";
import { Server as HttpServer, createServer} from "http"
import { Server as SocketIOServer, ServerOptions, Socket} from "socket.io"
import * as express from "express"

const DEFAULT_SOCKET_PORT = 9999;
const KARMA_CONNECT_TIMEOUT = 300000;

export class KarmaEventListener {
  public isTestRunning: boolean = false;
  public lastRunTests: string = "";
  public testStatus: TestResult | undefined;
  public runCompleteEvent: KarmaEvent | undefined;
  public isComponentRun: boolean = false;
  private savedSpecs: SpecCompleteResponse[] = [];
  private server: HttpServer | undefined;
  private readonly sockets: Set<Socket> = new Set();

  public constructor(
    private readonly eventEmitter: EventEmitter, 
    private readonly logger: Logger
  ) {}

  public listenForNewConnection(socketPort?: number): Promise<void> {
    this.stopListening();

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
        this.logger.info(`Karma Event Listener: New socket connection from Karma`);
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
          this.savedSpecs = [];
        });

        socket.on(KarmaEventName.RunComplete, (event: KarmaEvent) => {
          this.runCompleteEvent = event;
        });

        socket.on(KarmaEventName.SpecComplete, (event: KarmaEvent) => {
          this.onSpecComplete(event);
        });

        socket.on("disconnect", (reason: string) => {
          this.logger.info(`Karma Event Listener: Karma disconnected from socket with reason: ${reason}`);
        });
      });

      server!.listen(port, () => {
        this.logger.info(`Listening to KarmaReporter events on port ${port}`);
      });

      connectTimeoutId = setTimeout(() => {
        this.logger.error(`Timeout waiting on port ${port} to connect to Karma`);
        reject(`Timeout waiting to connect to Karma`);
      }, KARMA_CONNECT_TIMEOUT);
    });
  }

  public getLoadedTests(pathFinder: PathFinder): TestSuiteInfo {
    const specToTestSuiteMapper = new SpecResponseToTestSuiteInfoMapper(pathFinder);
    return specToTestSuiteMapper.map(this.savedSpecs);
  }

  private onSpecComplete(event: KarmaEvent) {
    const { results } = event;

    const testName = results.fullName;
    const isTestNamePerfectMatch = testName === this.lastRunTests;
    const isRootComponent = this.lastRunTests === "root";
    const isComponent = this.isComponentRun && testName.includes(this.lastRunTests);

    if (isTestNamePerfectMatch || isRootComponent || isComponent) {
      this.eventEmitter.emitTestStateEvent(results.id, TestState.Running);
      this.savedSpecs.push(results);

      this.eventEmitter.emitTestResultEvent(results.id, event);

      if (this.lastRunTests !== "") {
        this.testStatus = results.status;
      }
    }
  }

  public stopListening(): void {
    try {
      this.sockets.forEach(socket => {
        socket.removeAllListeners();
        socket.disconnect(true);
      });
      
      this.sockets.clear();
      this.server?.close();
      this.server = undefined;
      this.savedSpecs = [];

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
