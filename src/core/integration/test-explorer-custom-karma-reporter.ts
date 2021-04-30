import { TestResult } from "../../model/enums/test-status.enum";
import { RunStatus } from "../../model/enums/run-status.enum";
import { SpecCompleteResponse } from "../../model/spec-complete-response";
import { Server as SocketIOServer} from "socket.io"
import { io } from "socket.io-client";
import { ConfigOptions, TestResults as KarmaTestResults } from "karma";


const HEARTBEAT_TIMEOUT = 24 * 60 * 60 * 1000;
const HEARTBEAT_INTERVAL = 24 * 60 * 60 * 1000;

function TestExplorerCustomReporter(
  this: any, 
  baseReporterDecorator: any, 
  config: ConfigOptions, 
  logger: any, 
  emitter: any, 
  injector: any
) {
  this.config = config;
  this.emitter = emitter;

  const socketPort = process.env.karmaSocketPort as string;
  const socket = io("http://localhost:" + socketPort + "/", {
    forceNew: true, 
    reconnection: true
  });
  const socketOptions = {
    pingTimeout: HEARTBEAT_TIMEOUT,
    pingInterval: HEARTBEAT_INTERVAL
  };
  Object.assign(socket, socketOptions);
  this.socket = socket;

  configureTimeouts(injector);
  baseReporterDecorator(this);
  this.adapters = [];

  const emitEvent = (eventName: any, eventResults: any = null) => {
    this.socket.emit(eventName, { name: eventName, results: eventResults });
  };

  this.onSpecComplete = (browser: any, spec: any) => {
    let status: TestResult = TestResult.Failed;

    if (spec.skipped) {
      status = TestResult.Skipped;
      this.specSkipped(browser, spec);
    } else if (spec.success) {
      status = TestResult.Success;
    }

    const result = new SpecCompleteResponse(
      spec.id,
      spec.log,
      spec.suite,
      spec.description,
      spec.fullName,
      status,
      spec.time
    );

    /*
    // TODO: Figure out if this is required:
    if (result.status === TestResult.Failed) {
      result.fullResponse = spec;
    }
    */

    emitEvent("spec_complete", result);
  };

  this.onRunComplete = (browserCollection: any, result: any) => {
    emitEvent("run_complete", collectRunState(result));
  };

  this.onBrowserError = (browser: any, error: any) => {
    emitEvent("browser_error", error);
  };

  this.onBrowserStart = (browser: any, info: any) => {
    emitEvent("browser_start");
  };

  this.emitter.on("browsers_change", (capturedBrowsers: any) => {
    if (!capturedBrowsers.forEach) {
      // filter out events from Browser object
      return;
    }

    let proceed = true;
    capturedBrowsers.forEach((newBrowser: any) => {
      if (!newBrowser.id || !newBrowser.name || newBrowser.id === newBrowser.name) {
        proceed = false;
      }
    });
    if (proceed) {
      emitEvent("browser_connected");
    }
  });
}

function configureTimeouts(injector: any) {
  process.nextTick(() => {
    const webServer = injector.get("webServer");
    if (webServer) {
      // IDE posts http '/run' request to trigger tests (see karma-http-client.ts).
      // If a request executes more than `httpServer.timeout`, it will be timed out.
      // Disable timeout, as by default httpServer.timeout=120 seconds, not enough for suspended execution.
      webServer.timeout = 0;
    }
    const socketServer = injector.get("socketServer") as SocketIOServer;
    if (socketServer) {
      // Disable socket.io heartbeat (ping) to avoid browser disconnecting when debugging tests,
      // because no ping requests are sent when test execution is suspended on a breakpoint.
      // Default values are not enough for suspended execution:
      //    'heartbeat timeout' (pingTimeout) = 60000 ms
      //    'heartbeat interval' (pingInterval) = 25000 ms

      const socketOptions = {
        pingTimeout: HEARTBEAT_TIMEOUT,
        pingInterval: HEARTBEAT_INTERVAL
      };
      Object.assign(socketServer, socketOptions);
    }
  });
}

function collectRunState(runResult: KarmaTestResults): RunStatus {
  if (runResult.disconnected) {
    return RunStatus.Timeout;
  } else if (runResult.error) {
    return RunStatus.Error;
  } else {
    return RunStatus.Complete;
  }
}

TestExplorerCustomReporter.$inject = ["baseReporterDecorator", "config", "logger", "emitter", "injector"];

export const instance = TestExplorerCustomReporter;
export const name = "KarmaReporter";
