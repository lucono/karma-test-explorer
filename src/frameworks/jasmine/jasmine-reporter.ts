import { TestStatus } from "../../api/test-status";
import { TestRunStatus } from "./test-run-status";
import { SpecCompleteResponse } from "../karma/integration/spec-complete-response";
import { Server as SocketIOServer} from "socket.io"
import { io } from "socket.io-client";
import { ConfigOptions as KarmaConfigOptions, TestResults as KarmaTestResults } from "karma";
import { KARMA_SOCKET_PORT_ENV_VAR } from "../karma/karma-constants";

const PING_TIMEOUT = 24 * 60 * 60 * 1000;
const PING_INTERVAL = 24 * 60 * 60 * 1000;

function TestExplorerJasmineReporter(
  this: any, 
  baseReporterDecorator: any, 
  config: KarmaConfigOptions, 
  logger: any, 
  emitter: any, 
  injector: any
) {
  const log = logger.create(`reporter:${name}`);

  baseReporterDecorator(this);
  this.config = config;
  this.emitter = emitter;
  // this.adapters = [];

  const socketPort = process.env[KARMA_SOCKET_PORT_ENV_VAR] as string;
  log.info(`Using socket port from 'karmaSocketPort' env variable: ${socketPort}`);
  
  const socket = io("http://localhost:" + socketPort + "/", {
    forceNew: true, 
    reconnection: true
  });
  const socketOptions = {
    pingTimeout: PING_TIMEOUT,
    pingInterval: PING_INTERVAL
  };
  log.debug(`Using ping timeout '${PING_TIMEOUT}' and ping interval '${PING_INTERVAL}'`);

  Object.assign(socket, socketOptions);
  this.socket = socket;

  configureTimeouts(injector);

  const emitEvent = (eventName: any, eventResults: any = null) => {
    this.socket.emit(eventName, { name: eventName, results: eventResults });
  };

  this.onSpecComplete = (browser: any, spec: { [key: string]: any }) => {
    let status: TestStatus;
    let fullResponse: { [key: string]: any } | undefined;

    if (spec.skipped) {
      status = TestStatus.Skipped;
      this.specSkipped(browser, spec);

    } else if (spec.success) {
      status = TestStatus.Success;

    } else {
      status = TestStatus.Failed;
      fullResponse = spec;
    }

    const result: SpecCompleteResponse = {
      id: spec.id,
      failureMessages: spec.log,
      suite: spec.suite,
      description: spec.description,
      fullName: spec.fullName,
      status,
      timeSpentInMilliseconds: spec.time,
      fullResponse
      // filePath,
      // line,
    };

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
        pingTimeout: PING_TIMEOUT,
        pingInterval: PING_INTERVAL
      };
      Object.assign(socketServer, socketOptions);
    }
  });
}

function collectRunState(runResult: KarmaTestResults): TestRunStatus {
  if (runResult.disconnected) {
    return TestRunStatus.Timeout;
  } else if (runResult.error) {
    return TestRunStatus.Error;
  } else {
    return TestRunStatus.Complete;
  }
}

TestExplorerJasmineReporter.$inject = ["baseReporterDecorator", "config", "logger", "emitter", "injector"];

export const instance = TestExplorerJasmineReporter;
export const name = "KarmaTestExplorerJasmineReporter";
