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
import { Server as SocketIOServer, ServerOptions} from "socket.io"
import * as express from "express"

const DEFAULT_SOCKET_PORT = 9999;

export class KarmaEventListener {
  public isTestRunning: boolean = false;
  public lastRunTests: string = "";
  public testStatus: TestResult | undefined;
  public runCompleteEvent: KarmaEvent | undefined;
  public isComponentRun: boolean = false;
  private savedSpecs: SpecCompleteResponse[] = [];
  private server: HttpServer | undefined;
  // private serverDisconnectRequested: boolean = false;

  public constructor(
    private readonly eventEmitter: EventEmitter, 
    private readonly logger: Logger
  ) {}

  public connect(socketPort?: number): Promise<void> {
    const app = express();
    const server = createServer(app);

    const socketServerOptions = {
      // forceNew: true,
      pingInterval: 24 * 60 * 60 * 1000,
      pingTimeout: 24 * 60 * 60 * 1000
    } as ServerOptions;

    const io = new SocketIOServer(server, socketServerOptions);
    const port = socketPort !== 0 ? socketPort : DEFAULT_SOCKET_PORT;

    return new Promise<void>(resolve => {
      io.on("connection", (socket) => {
        socket.on(KarmaEventName.BrowserConnected, () => {
          this.logger.info(`Karma Event Listener: Browser connected`);
          this.setServerInfo(server);
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
          this.clearServerInfo(server);
          // const isKarmaBeingClosedByChrome = (reason === "transport close" && !this.serverDisconnectRequested);

          // // workaround: if the connection is closed by chrome, we just reload the test enviroment
          // // TODO: fix chrome closing all socket connections.
          // // FIXME: This should be reloading just the karma tests rather than all types of tests in test explorer
          // if (isKarmaBeingClosedByChrome) {
          //   commands.executeCommand("test-explorer.reload");
          // }
        });
      });

      server!.listen(port, () => {
        this.logger.info("Listening to KarmaReporter events on port " + port);
      });
    });
  }

  public getLoadedTests(pathFinder: PathFinder): TestSuiteInfo {
    const specToTestSuiteMapper = new SpecResponseToTestSuiteInfoMapper(pathFinder);
    return specToTestSuiteMapper.map(this.savedSpecs);
  }

  public async disconnect(): Promise<void> {
    this.logger.info(`Disconnecting from karma server`);
    // this.serverConnected = false; // FIXME: set to false on actual disconnection eent
    // this.serverDisconnectRequested = true;

    if (!this.isConnected()) {
      return;
    }
    const server = this.server!;

    return new Promise<void>((resolve, reject) => {
      server.close(error => error === undefined ? resolve() : reject(error));
    });
  }

  public isConnected(): boolean {
    return this.server !== undefined;
  }

  private setServerInfo(server: HttpServer) {
    this.server = server;
    // this.serverDisconnectRequested = false;
  }

  private clearServerInfo(server: HttpServer) {
    if (this.server && this.server === server) {
      this.server = undefined;
    }
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
}
