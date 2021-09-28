import { EventEmitter } from 'events';
import { Server as HttpServer } from 'http';
import { ConfigOptions as KarmaConfigOptions, TestResults as KarmaTestResults } from 'karma';
import { resolve } from 'path';
import { Worker } from 'worker_threads';
import { KARMA_SOCKET_PING_INTERVAL, KARMA_SOCKET_PING_TIMEOUT } from '../../../constants';
import { TestStatus } from '../../../core/base/test-status';
import { BasicLog } from '../../../util/logging/basic-log';
import { LogLevel } from '../../../util/logging/log-level';
import { Logger } from '../../../util/logging/logger';
import { LoggerAdapter } from '../../../util/logging/logger-adapter';
import { MultiEventHandler } from '../../../util/multi-event-handler';
import { KarmaEnvironmentVariable } from '../karma-environment-variable';
import { KarmaLogger, KarmaLogLevel } from '../karma-logger';
import { BrowserInfo, KarmaEvent, KarmaEventName } from './karma-event';
import { LightSpecCompleteResponse } from './spec-complete-response';
import { TestResultEmitterWorkerData } from './test-result-emitter-worker-data';
import { TestRunStatus } from './test-run-status';

function KarmaTestExplorerReporter(
  this: any,
  baseReporterDecorator: any,
  config: KarmaConfigOptions,
  logger: any,
  emitter: EventEmitter,
  injector: any
) {
  baseReporterDecorator(this);

  this.config = config;
  this.emitter = emitter;

  // --- Setup logger ---

  const karmaLogLevel: KarmaLogLevel = process.env[KarmaEnvironmentVariable.KarmaLogLevel]! as KarmaLogLevel;
  const logLevel: LogLevel = LogLevel[karmaLogLevel];
  const log: BasicLog = logger.create(`reporter:${name}`);
  const reporterLogger: Logger = LoggerAdapter.fromBasicLog(log, logLevel);
  const karmaLogger: KarmaLogger = reporterLogger;

  // --- Setup worker to communicate with extension ---

  const socketPort = Number.parseInt(process.env[KarmaEnvironmentVariable.KarmaSocketPort]!, 10);

  const workerData: TestResultEmitterWorkerData = {
    socketPort,
    pingTimeout: KARMA_SOCKET_PING_TIMEOUT,
    pingInterval: KARMA_SOCKET_PING_INTERVAL
  };

  const workerScriptFile = resolve(__dirname, './test-result-emitter-worker.js');
  const worker = new Worker(workerScriptFile, { workerData });

  karmaLogger.debug(
    () => `Using socket port from '${KarmaEnvironmentVariable.KarmaSocketPort}' env variable: ${socketPort}`
  );

  karmaLogger.debug(
    () => `Using ping timeout of '${KARMA_SOCKET_PING_TIMEOUT}' and ping interval of '${KARMA_SOCKET_PING_INTERVAL}'`
  );

  configureTimeouts(injector);

  const sendEvent = (event: KarmaEvent) => {
    worker.postMessage({ ...event });
  };

  // --- Setup karma event listeners ---

  const karmaEventHandler: MultiEventHandler<KarmaEventName, (eventName: KarmaEventName, ...args: any[]) => void> =
    new MultiEventHandler(reporterLogger);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  karmaEventHandler.setDefaultHandler((eventName: string, ...args: any[]) => {
    karmaLogger.debug(() => `No specific handler for event: ${eventName}`);
    sendEvent({ name: eventName as KarmaEventName });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  karmaEventHandler.setErrorHandler((eventName: string, error: Error, ...args: any[]) => {
    karmaLogger.error(() => `Error while handling event '${eventName}': ${error}`);
  });

  interceptAllEmitterEvents(emitter, (eventName: string, ...args: any[]) => {
    karmaLogger.debug(() => `New Karma event: ${eventName}`);
    karmaEventHandler.handleEvent(eventName as KarmaEventName, eventName as KarmaEventName, ...args);
  });

  karmaEventHandler.setEventHandler(KarmaEventName.Listening, (name: KarmaEventName, port: number) => {
    sendEvent({ name, port });
  });

  karmaEventHandler.setEventHandler(KarmaEventName.RunStart, (name: KarmaEventName, browsers: any) => {
    sendEvent({
      name,
      browsers: browsers.map(getBrowserInfo)
    });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  karmaEventHandler.setEventHandler(KarmaEventName.BrowserStart, (name: KarmaEventName, browser: any, info: any) => {
    sendEvent({
      name,
      browser: getBrowserInfo(browser)
    });
  });

  karmaEventHandler.setEventHandler(
    KarmaEventName.SpecComplete,
    (name: KarmaEventName, browser: any, spec: Record<string, any>) => {
      const status: TestStatus = spec.skipped
        ? TestStatus.Skipped
        : spec.success
        ? TestStatus.Success
        : TestStatus.Failed;

      const specResult: LightSpecCompleteResponse = {
        id: spec.id,
        failureMessages: spec.log,
        suite: spec.suite,
        description: spec.description,
        status,
        timeSpentInMilliseconds: spec.time
      };

      sendEvent({
        name,
        browser: getBrowserInfo(browser),
        results: specResult
      });
    }
  );

  karmaEventHandler.setEventHandler(
    KarmaEventName.BrowserComplete,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (name: KarmaEventName, browser: any, runInfo: any) => {
      sendEvent({
        name,
        browser: getBrowserInfo(browser)
      });
    }
  );

  karmaEventHandler.setEventHandler(
    KarmaEventName.RunComplete,
    (name: KarmaEventName, browsers: any, runResult: KarmaTestResults) => {
      const runStatus = runResult.disconnected
        ? TestRunStatus.Timeout
        : runResult.error
        ? TestRunStatus.Error
        : TestRunStatus.Complete;

      sendEvent({
        name,
        browsers: browsers.map(getBrowserInfo),
        runStatus
      });
    }
  );

  karmaEventHandler.setEventHandler(KarmaEventName.BrowserError, (name: KarmaEventName, browser: any, error: any) => {
    sendEvent({
      name,
      browser: getBrowserInfo(browser),
      error
    });
  });

  karmaEventHandler.setEventHandler(KarmaEventName.BrowserProcessFailure, (name: KarmaEventName, failureData: any) =>
    sendEvent({
      name,
      error: failureData.error
    })
  );

  karmaEventHandler.setEventHandler(KarmaEventName.BrowsersReady, (name: KarmaEventName) => {
    sendEvent({ name });
  });

  karmaEventHandler.setEventHandler(KarmaEventName.BrowsersChange, (name: KarmaEventName, browsers: any) => {
    sendEvent({
      name,
      browsers: browsers.map(getBrowserInfo)
    });
  });
}

const interceptAllEmitterEvents = (emitter: EventEmitter, listener: (eventName: string, ...args: any[]) => void) => {
  const emit = emitter.emit.bind(emitter);

  emitter.emit = (eventName: string, ...args: any[]): boolean => {
    listener(eventName, ...args);
    return emit(eventName, ...args);
  };
};

const getBrowserInfo = (browserData: any): BrowserInfo | undefined => {
  return browserData
    ? {
        id: browserData.id,
        name: browserData.name,
        fullName: browserData.fullName
      }
    : undefined;
};

const configureTimeouts = (injector: any) => {
  process.nextTick(() => {
    const webServer: HttpServer = injector.get('webServer');
    if (webServer) {
      // Disable timeout in order to support long periods of
      // breakpoint-suspended execution during test debugging
      webServer.timeout = 0;
    }
  });
};

KarmaTestExplorerReporter.$inject = ['baseReporterDecorator', 'config', 'logger', 'emitter', 'injector'];

export const name = KarmaTestExplorerReporter.name;
export const instance = KarmaTestExplorerReporter;
