import { Server as SocketIOServer} from "socket.io"
import { ConfigOptions as KarmaConfigOptions, TestResults as KarmaTestResults } from "karma";
import { EventEmitter } from "events";
import { KarmaEventName } from "../karma/runner/karma-event-name";
import { Worker } from "worker_threads";
import { TestStatus } from "../../api/test-status";
import { LightSpecCompleteResponse } from "../karma/runner/spec-complete-response";
import { TestRunStatus } from "./test-run-status";
import { resolve } from "path";
import { TestResultEmitterWorkerData } from "../karma/runner/test-result-emitter-worker-data";
import { KarmaEnvironmentVariable } from "../karma/karma-environment-variable";
import { BrowserInfo, KarmaEvent } from "../karma/runner/karma-event";
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

  const socketPort = Number.parseInt(process.env[KarmaEnvironmentVariable.KarmaSocketPort]!, 10);

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

  const sendEvent = (event: KarmaEvent) => worker.postMessage({ ...event });

  const getBrowser = (browser: any): BrowserInfo | undefined => !browser ? undefined : {
    id: browser.id,
    name: browser.name,
    fullName: browser.fullName
  }

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
    
    sendEvent({
      name: KarmaEventName.SpecComplete,
      browser: getBrowser(browser),
      results: specResult
    });
  };

  self.onRunComplete = (browsers: any, result: any) => {
    sendEvent({
      name: KarmaEventName.RunComplete,
      browsers: browsers.map(getBrowser),
      results: collectRunState(result)
    });
  };

  self.onBrowserError = (browser: any, error: any) => {
    sendEvent({
      name: KarmaEventName.BrowserError,
      browser: getBrowser(browser),
      error
    });
  };

  self.onBrowserStart = (browser: any, info: any) => {
    sendEvent({
      name: KarmaEventName.BrowserStart,
      browser: getBrowser(browser),
      info
    });
  };

  self.onBrowserComplete = (browser: any, results: any) => {
    sendEvent({
      name: KarmaEventName.BrowserComplete,
      browser: getBrowser(browser),
      results
    });
  };

  self.emitter.on(KarmaEventName.BrowserChange, (capturedBrowsers: any) => {
    let browserHasConnected = true;

    capturedBrowsers.forEach?.((newBrowser: any) => {
      browserHasConnected &&= newBrowser.id && newBrowser.name && newBrowser.id !== newBrowser.name;
    });
    
    if (browserHasConnected) {
      sendEvent({
        name: KarmaEventName.BrowserConnected
      });
    }
  });

  // FIXME: Handle more `KarmaEventName` events
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

export const name = TestExplorerJasmineReporter.name;
export const instance = TestExplorerJasmineReporter;
