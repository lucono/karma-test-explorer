import { commands } from "vscode";
import { TestSuiteInfo } from "vscode-test-adapter-api";
import { SpecResponseToTestSuiteInfoMapper } from "../../core/test-explorer/spec-response-to-test-suite-info.mapper";
import { KarmaEvent } from "../../model/karma-event";
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

export class KarmaEventListener {
  public isServerConnected: boolean = false;
  public isTestRunning: boolean = false;
  public lastRunTests: string = "";
  public testStatus: TestResult | undefined;
  public runCompleteEvent: KarmaEvent | undefined;
  public isComponentRun: boolean = false;
  private savedSpecs: SpecCompleteResponse[] = [];
  private server: http.Server | undefined;
  private karmaShutdownInitiated: boolean = false;

  public constructor(
    private readonly eventEmitter: EventEmitter, 
    private readonly logger: Logger
  ) {}

  public listenTillBrowserConnected(defaultSocketPort?: number): Promise<void> {
    return new Promise<void>(resolve => {
      this.karmaShutdownInitiated = false;
      const app = express();
      this.server = http.createServer(app);

      const socketOptions = {
        forceNew: true,
        pingInterval: 24 * 60 * 60 * 1000,
        pingTimeout: 24 * 60 * 60 * 1000
      } as SocketIO.ServerOptions;

      const io = SocketIO(this.server, socketOptions);
      const port = defaultSocketPort !== 0 ? defaultSocketPort : 9999;

      io.on("connection", (socket) => {
        socket.on(KarmaEventName.BrowserConnected, () => {
          this.onBrowserConnected(resolve);
        });
        socket.on(KarmaEventName.BrowserError, (event: KarmaEvent) => {
          this.logger.info("browser_error " + event.results);
        });
        socket.on(KarmaEventName.BrowserStart, () => {
          this.savedSpecs = [];
        });
        socket.on(KarmaEventName.RunComplete, (event: KarmaEvent) => {
          this.runCompleteEvent = event;
        });
        socket.on(KarmaEventName.SpecComplete, (event: KarmaEvent) => {
          this.onSpecComplete(event);
        });

        socket.on("disconnect", (event: ErrorCode) => {
          const isKarmaBeingClosedByChrome = event === ErrorCode.TransportClose && !this.karmaShutdownInitiated;

          // workaround: if the connection is closed by chrome, we just reload the test enviroment
          // TODO: fix chrome closing all socket connections.
          // FIXME: This should be reloading just the karma tests rather than all types of tests in test explorer
          if (isKarmaBeingClosedByChrome) {
            commands.executeCommand("test-explorer.reload");
          }
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

  public stopListeningToKarma() {
    this.isServerConnected = false;
    this.karmaShutdownInitiated = true;
    this.server?.close();
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

  private onBrowserConnected(resolve: (value?: void | PromiseLike<void>) => void) {
    this.isServerConnected = true;
    resolve();
  }
}
