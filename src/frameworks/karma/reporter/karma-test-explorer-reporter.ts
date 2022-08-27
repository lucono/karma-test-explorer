import { EventEmitter } from 'events';
import { Server as HttpServer } from 'http';
import { TestResults as KarmaTestResults } from 'karma';
import { resolve } from 'path';
import { Worker } from 'worker_threads';
import { KARMA_SOCKET_PING_INTERVAL, KARMA_SOCKET_PING_TIMEOUT, KARMA_TEST_RUN_ID_FLAG } from '../../../constants';
import { TestStatus } from '../../../core/base/test-status';
import { LogLevel } from '../../../util/logging/log-level';
import { Logger } from '../../../util/logging/logger';
import { LoggerAdapter } from '../../../util/logging/logger-adapter';
import { MultiEventHandler } from '../../../util/multi-event-handler';
import { getJsonCircularReferenceReplacer } from '../../../util/utils';
import { KarmaEnvironmentVariable } from '../karma-environment-variable';
import { BrowserInfo, KarmaEvent, KarmaEventName } from '../runner/karma-event';
import { LightSpecCompleteResponse } from '../runner/spec-complete-response';
import { TestRunStatus } from '../runner/test-run-status';
import { TestResultEmitterWorkerData } from './test-result-emitter-worker-data';

export function KarmaTestExplorerReporter(
  this: any,
  baseReporterDecorator: any,
  emitter: EventEmitter,
  karmaLogger: any,
  injector: any
) {
  baseReporterDecorator(this);

  // --- Setup logger ---

  const logLevel = process.env[KarmaEnvironmentVariable.KarmaReporterLogLevel] as LogLevel;

  const logger: Logger = LoggerAdapter.fromBasicLog(
    karmaLogger.create(`reporter:${KarmaTestExplorerReporter.name}`),
    logLevel,
    { patchTraceLogger: true }
  );

  // --- Setup worker to communicate with extension ---

  const socketPort = Number.parseInt(process.env[KarmaEnvironmentVariable.KarmaSocketPort]!, 10);

  const workerData: TestResultEmitterWorkerData = {
    socketPort,
    pingTimeout: KARMA_SOCKET_PING_TIMEOUT,
    pingInterval: KARMA_SOCKET_PING_INTERVAL
  };

  const workerScriptFile = resolve(__dirname, './test-result-emitter-worker.js');
  const worker = new Worker(workerScriptFile, { workerData });

  logger.debug(
    () => `Using socket port from '${KarmaEnvironmentVariable.KarmaSocketPort}' env variable: ${socketPort}`
  );

  logger.debug(
    () => `Using ping timeout of '${KARMA_SOCKET_PING_TIMEOUT}' and ping interval of '${KARMA_SOCKET_PING_INTERVAL}'`
  );

  configureTimeouts(injector);

  const sendEvent = (event: KarmaEvent) => {
    worker.postMessage({ ...event });
  };

  // --- Setup karma event listeners ---

  const karmaEventHandler: MultiEventHandler<KarmaEventName, (eventName: KarmaEventName, ...args: any[]) => void> =
    new MultiEventHandler(logger);

  karmaEventHandler.setDefaultHandler((eventName: string, ...args: any[]) => {
    logger.debug(() => `No specific handler for event: ${eventName}`);
    const isErrorEvent = eventName.toLowerCase().includes('error');

    if (isErrorEvent) {
      logger.trace(
        () =>
          `No specific handler for received error event '${eventName}' with data: ` +
          `${JSON.stringify(args, getJsonCircularReferenceReplacer(), 2)}`
      );
    }
    sendEvent({ name: eventName as KarmaEventName });
  });

  karmaEventHandler.setErrorHandler((eventName: string, error: Error, ...args: any[]) => {
    logger.error(() => `Error while handling event '${eventName}': ${error}`);
    logger.trace(
      () =>
        `Event data for errored '${eventName}' event handling: ` +
        `${JSON.stringify(args, getJsonCircularReferenceReplacer(), 2)}`
    );
  });

  interceptAllEmitterEvents(emitter, (eventName: string, ...args: any[]) => {
    logger.trace(
      () => `New Karma event: ${JSON.stringify({ eventName, args }, getJsonCircularReferenceReplacer(), 2)}`
    );
    karmaEventHandler.handleEvent(eventName as KarmaEventName, eventName as KarmaEventName, ...args);
  });

  karmaEventHandler.setEventHandler(KarmaEventName.Listening, (name: KarmaEventName, port: number) => {
    sendEvent({ name, port });
  });

  karmaEventHandler.setEventHandler(KarmaEventName.RunStart, (name: KarmaEventName, browsers: any) => {
    const clientArgs: string[] = browsers?.emitter?._injector?._providers?.config?.[1]?.client?.args ?? [];
    let runId: string | undefined;

    logger.debug(() => `Karma event '${name}' has client args: ${JSON.stringify(clientArgs, null, 2)}`);

    if (clientArgs) {
      const runIdArg = clientArgs.find(clientArg => clientArg.startsWith(KARMA_TEST_RUN_ID_FLAG));

      if (runIdArg) {
        runId = runIdArg.split('=')[1];
        logger.debug(() => `Karma event '${name}' has runId: ${runId}`);
      }
    }

    sendEvent({
      name,
      runId,
      browsers: browsers.map(getBrowserInfo)
    });
  });

  karmaEventHandler.setEventHandler(KarmaEventName.BrowserStart, (name: KarmaEventName, browser: any, info: any) => {
    logger.trace(
      () => `Karma event '${name}' has 'info': ${JSON.stringify(info, getJsonCircularReferenceReplacer(), 2)}`
    );

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
    (name: KarmaEventName, browser: any, runInfo: any) => {
      logger.trace(
        () => `Karma event '${name}' has 'runInfo': ${JSON.stringify(runInfo, getJsonCircularReferenceReplacer(), 2)}`
      );

      sendEvent({
        name,
        browser: getBrowserInfo(browser)
      });
    }
  );

  karmaEventHandler.setEventHandler(
    KarmaEventName.RunComplete,
    (name: KarmaEventName, browsers: any, runResult: KarmaTestResults) => {
      const clientArgs: string[] = browsers?.emitter?._injector?._providers?.config?.[1]?.client?.args ?? [];
      let runId: string | undefined;

      logger.debug(() => `Karma event '${name}' has client args: ${JSON.stringify(clientArgs, null, 2)}`);

      if (clientArgs) {
        const runIdArg = clientArgs.find(clientArg => clientArg.startsWith(KARMA_TEST_RUN_ID_FLAG));

        if (runIdArg) {
          runId = runIdArg.split('=')[1];
          logger.debug(() => `Karma event '${name}' has runId: ${runId}`);
        }
      }

      const runStatus = runResult.disconnected
        ? TestRunStatus.Timeout
        : runResult.error
        ? TestRunStatus.Error
        : TestRunStatus.Complete;

      sendEvent({
        name,
        runId,
        runStatus,
        exitCode: runResult.exitCode,
        browsers: browsers.map(getBrowserInfo),
        error: typeof runResult.error === 'string' ? runResult.error : undefined
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

KarmaTestExplorerReporter.$inject = ['baseReporterDecorator', 'emitter', 'logger', 'injector'];

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
