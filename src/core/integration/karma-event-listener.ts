// import { commands } from "vscode";
import { TestSuiteInfo } from "vscode-test-adapter-api";
import { SpecResponseToTestSuiteInfoMapper } from "../../core/test-explorer/spec-response-to-test-suite-info.mapper";
import { KarmaEvent } from "../../model/karma-event";
import { SocketEvent } from "../../model/enums/socket-event.enum";
import { KarmaEventName } from "../../model/enums/karma-event-name.enum";
import { TestState } from "../../model/enums/test-state.enum";
import { Logger } from "../helpers/logger";
import { EventEmitter } from "../helpers/event-emitter";
import { TestResult } from "../../model/enums/test-status.enum";
import { ErrorCode } from "../../model/enums/error-code.enum";
import { PathFinder } from "../helpers/path-finder";
import { SpecCompleteResponse } from "../../model/spec-complete-response";
import * as http from "http"
import * as express from "express"
import * as SocketIO from "socket.io"

export interface KarmaEventListenerOptions {
  connectionDroppedHandler?: () => void
}

export class KarmaEventListener {
  private browserConnected: boolean = false;
  public isTestRunning: boolean = false;
  public lastRunTests: string = "";
  public testStatus: TestResult | undefined;
  public runCompleteEvent: KarmaEvent | undefined;
  public isComponentRun: boolean = false;
  private savedSpecs: SpecCompleteResponse[] = [];
  private server: http.Server | undefined;
  private isKarmaDisconnectInProgress: boolean = false;

  public constructor(
    private readonly eventEmitter: EventEmitter, 
    private readonly logger: Logger,
    private readonly options?: KarmaEventListenerOptions
  ) {}

  public receiveBrowserConnection(defaultSocketPort?: number): Promise<void> {
    return new Promise<void>(resolve => {
      this.isKarmaDisconnectInProgress = false;
      const app = express();
      this.server = http.createServer(app);

      const socketOptions = {
        forceNew: true,
        pingInterval: 24 * 60 * 60 * 1000,
        pingTimeout: 24 * 60 * 60 * 1000
      } as SocketIO.ServerOptions;

      const io = SocketIO(this.server, socketOptions);
      const port = defaultSocketPort !== 0 ? defaultSocketPort : 9999;

      io.on(SocketEvent.Connect, (socket) => {

        socket.on(KarmaEventName.BrowserConnected, () => {
          this.logger.info(`Karma Event Listener: Browser connected`);
          this.browserConnected = true;
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

        socket.on(SocketEvent.Disconnect, (event: ErrorCode) => {
          const connectionDropped = !this.isKarmaDisconnectInProgress;

          this.logger.info(
            `Karma Event Listener: Browser connection ` +
            `${connectionDropped ? "dropped" : "disconnected normally"} ` +
            `with code: ${JSON.stringify(event)}`);

          this.browserConnected = false;

          if (connectionDropped) {
            this.options?.connectionDroppedHandler?.();
          }
          /*
          // FIXME: Remove this workaround if no longer necessary
          // FIXME: Also, this should be reloading just the karma tests rather than all types of tests in test explorer
          // ----------
          // workaround: if the connection is closed by chrome, we just reload the test enviroment
          // TODO: fix chrome closing all socket connections.
          const isKarmaBeingClosedByChrome = event === ErrorCode.TransportClose && !this.isKarmaDisconnectInProgress;
          if (isKarmaBeingClosedByChrome) {
            this.logger.debug("Detected Chrome must be closing the socket connection - Reloading the test environment");
            commands.executeCommand("test-explorer.reload");
          }
          */
        });
      });

      this.server!.listen(port, () => {
        this.logger.info("Listening to KarmaReporter events on port " + port);
      });
    });
  }

  public getLoadedTests(pathFinder: PathFinder): TestSuiteInfo {
    const specToTestSuiteMapper = new SpecResponseToTestSuiteInfoMapper(pathFinder);
    return specToTestSuiteMapper.map(this.savedSpecs);
  }

  public disconnectFromKarma() {
    this.logger.info(`Disconnecting from Karma`);
    this.isKarmaDisconnectInProgress = true;
    this.server?.close();
    this.isKarmaDisconnectInProgress = false;
  }

  public isBrowserConnected() {
    return this.browserConnected;
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
