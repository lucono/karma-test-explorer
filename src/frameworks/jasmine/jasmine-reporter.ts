import { Server as SocketIOServer} from "socket.io"
import { ConfigOptions as KarmaConfigOptions, TestResults as KarmaTestResults } from "karma";
import { KARMA_SOCKET_PORT_ENV_VAR } from "../karma/karma-constants";
import { EventEmitter } from "events";
import { KarmaEventName } from "../karma/runner/karma-event-name";
import { Worker } from "worker_threads";
import { TestStatus } from "../../api/test-status";
import { LightSpecCompleteResponse } from "../karma/runner/spec-complete-response";
import { TestRunStatus } from "./test-run-status";
import { resolve } from "path";
import { TestResultEmitterWorkerData } from "../karma/runner/test-result-emitter-worker-data";
// import { resolve } from "path";

const pingTimeout = 24 * 60 * 60 * 1000;
const pingInterval = 24 * 60 * 60 * 1000;

function TestExplorerJasmineReporter(
  this: any, 
  baseReporterDecorator: any, 
  config: KarmaConfigOptions, 
  logger: any, 
  emitter: EventEmitter, 
  injector: any
) {
  const self = this;
  const log = logger.create(`reporter:${name}`);

  baseReporterDecorator(self);
  self.config = config;
  self.emitter = emitter;
  // self.adapters = [];

  const socketPort = Number.parseInt(process.env[KARMA_SOCKET_PORT_ENV_VAR]!, 10);

  const workerData: TestResultEmitterWorkerData = {
    socketPort,
    pingTimeout,
    pingInterval
  };

  const workerScriptFile = resolve(__dirname, '..', 'karma', 'runner', 'test-result-emitter-worker.js');
  const worker = new Worker(workerScriptFile, { workerData });

  log.info(`Using socket port from 'karmaSocketPort' env variable: ${socketPort}`);
  log.debug(`Using ping timeout '${pingTimeout}' and ping interval '${pingInterval}'`);

  // self.socket = socket;

  configureTimeouts(injector);

  const sendEvent = (eventName: KarmaEventName, eventResults: any = null) => {
    worker.postMessage({
      name: eventName,
      results: eventResults
    });
  };

  self.onSpecComplete = (browser: any, spec: Record<string, any>) => {
    let status: TestStatus;
    // let fullResponse: { [key: string]: any } | undefined;

    if (spec.skipped) {
      status = TestStatus.Skipped;
      self.specSkipped(browser, spec);

    } else if (spec.success) {
      status = TestStatus.Success;

    } else {
      status = TestStatus.Failed;
      // fullResponse = spec;
    }

    const specResult: LightSpecCompleteResponse = {
      id: spec.id,
      failureMessages: spec.log,
      suite: spec.suite,
      description: spec.description,
      status,
      timeSpentInMilliseconds: spec.time
      // fullResponse,
      // fullName: spec.fullName,
      // filePath,
      // line,
    };
    sendEvent(KarmaEventName.SpecComplete, specResult);
  };

  self.onRunComplete = (browserCollection: any, result: any) => {
    sendEvent(KarmaEventName.RunComplete, collectRunState(result));
  };

  self.onBrowserError = (browser: any, error: any) => {
    sendEvent(KarmaEventName.BrowserError, error);
  };

  self.onBrowserStart = (browser: any, info: any) => {
    sendEvent(KarmaEventName.BrowserStart);
  };

  self.emitter.on(KarmaEventName.BrowserChange, (capturedBrowsers: any) => {
    let browserHasConnected = true;

    capturedBrowsers.forEach?.((newBrowser: any) => {
      browserHasConnected &&= newBrowser.id && newBrowser.name && newBrowser.id !== newBrowser.name;
    });
    
    if (browserHasConnected) {
      sendEvent(KarmaEventName.BrowserConnected);
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

      const socketOptions = { pingTimeout, pingInterval };
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

export const name = "KarmaTestExplorerJasmineReporter";
export const instance = TestExplorerJasmineReporter;
