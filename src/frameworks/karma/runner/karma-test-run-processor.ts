import { KARMA_TEST_EVENT_INTERVAL_TIMEOUT } from '../../../constants';
import { TestStatus } from '../../../core/base/test-status';
import { Notifications, StatusType } from '../../../core/vscode/notifications';
import { Disposable } from '../../../util/disposable/disposable';
import { Disposer } from '../../../util/disposable/disposer';
import { DeferredExecution } from '../../../util/future/deferred-execution';
import { Execution } from '../../../util/future/execution';
import { SimpleLogger } from '../../../util/logging/simple-logger';
import { MultiEventHandler } from '../../../util/multi-event-handler';
import { KarmaAutoWatchTestEventProcessor } from './karma-auto-watch-test-event-processor';
import { KarmaEvent, KarmaEventName } from './karma-event';
import { KarmaTestEventProcessor, TestEventProcessingOptions } from './karma-test-event-processor';
import { DebugStatusResolver } from './karma-test-listener';
import { LightSpecCompleteResponse, SpecCompleteResponse } from './spec-complete-response';
import { TestRunStatus } from './test-run-status';

export enum KarmaConnectionStatus {
  Started,
  Ended,
  Failed
}

export interface KarmaEventResult {
  connectionStatus: KarmaConnectionStatus;
  error?: string;
}

interface TestCaptureSession {
  readonly testRunStarted: (testRunId?: string) => void;
  readonly testRunEnded: (testRunId?: string) => void;
}

type KarmaEventHandler = (event: KarmaEvent) => KarmaEventResult | void;

export class KarmaTestRunProcessor implements Disposable {
  private disposables: Disposable[] = [];
  private currentTestCaptureSession?: TestCaptureSession;
  private readonly eventHandler: MultiEventHandler<KarmaEventName, KarmaEventHandler>;

  public constructor(
    private readonly primaryTestEventProcessor: KarmaTestEventProcessor,
    private readonly watchModeTestEventProcessor: KarmaAutoWatchTestEventProcessor | undefined,
    private readonly notifications: Notifications,
    private readonly debugStatusResolver: DebugStatusResolver,
    private readonly testDiscoveryEventProcessingOptions: TestEventProcessingOptions,
    private readonly testRunEventProcessingOptions: TestEventProcessingOptions,
    private readonly logger: SimpleLogger
  ) {
    this.eventHandler = this.createEventHandler();
    this.disposables.push(logger);
  }

  public processTestDiscovery(testRunId: string, testNames: string[]): Execution<void, SpecCompleteResponse[]> {
    return this.processTest(testRunId, testNames, this.testDiscoveryEventProcessingOptions);
  }

  public processTestRun(testRunId: string, testNames: string[]): Execution<void, SpecCompleteResponse[]> {
    return this.processTest(testRunId, testNames, this.testRunEventProcessingOptions);
  }

  private processTest(
    testRunId: string,
    testNames: string[],
    testEventProcessingOptions: TestEventProcessingOptions
  ): Execution<void, SpecCompleteResponse[]> {
    const deferredSpecCaptureExecution = new DeferredExecution<void, SpecCompleteResponse[]>();
    const futureSpecCaptureExecution = deferredSpecCaptureExecution.execution();

    const testEventIntervalTimeout = this.debugStatusResolver.isDebugging()
      ? undefined
      : KARMA_TEST_EVENT_INTERVAL_TIMEOUT;

    const testRunStartHandler = (startedTestRunId?: string) => {
      if (startedTestRunId !== testRunId) {
        this.logger.debug(
          () =>
            `New test run starting with id '${startedTestRunId}' ` +
            `is not for the current requested test run Id: ${testRunId}`
        );
        return;
      }
      this.logger.debug(() => `Test run starting for requested test run Id: ${testRunId}`);

      if (this.primaryTestEventProcessor.isProcessing()) {
        this.logger.debug(
          () =>
            `New requested test run with run id '${startedTestRunId}' ` +
            `is starting while another one with same Id is already in progress - ` +
            `Continuing with existing test`
        );
        return;
      }
      this.logger.debug(() => `Starting test capture session for current requested test run Id: ${testRunId}`);
      deferredSpecCaptureExecution.start();

      const futureProcessingResults = this.primaryTestEventProcessor.processTestEvents(testNames, {
        ...testEventProcessingOptions,
        testEventIntervalTimeout
      });

      futureProcessingResults.then(results => deferredSpecCaptureExecution.end(results.processedSpecs));

      futureProcessingResults.catch(failureReason => {
        this.logger.error(() => `Could not capture Karma events - Test execution failed: ${failureReason}`);
        deferredSpecCaptureExecution.fail(failureReason);
      });
    };

    const testRunEndHandler = (endedTestRunId?: string) => {
      if (endedTestRunId !== testRunId) {
        this.logger.debug(
          () =>
            `Test run ending now with test run Id '${endedTestRunId}' ` +
            `is not for the current requested test run Id: ${testRunId}`
        );
        return;
      }
      this.logger.debug(() => `Test run ending for current requested test run Id: ${testRunId}`);

      if (!this.primaryTestEventProcessor.isProcessing()) {
        this.logger.debug(
          () =>
            `Test run ending now with test run Id '${endedTestRunId}' while ` +
            `current requested test run with same Id is not currently processing - ` +
            `Ignoring test run end event`
        );
        return;
      }
      this.logger.debug(() => `Ending test capture session for current requested test run Id: ${testRunId}`);
      this.primaryTestEventProcessor.concludeProcessing();
    };

    this.currentTestCaptureSession = {
      testRunStarted: testRunStartHandler,
      testRunEnded: testRunEndHandler
    };

    futureSpecCaptureExecution.done().then(() => {
      this.logger.debug(() => `Done with test event handling for test run Id: ${testRunId}`);
      this.currentTestCaptureSession = undefined;
    });

    this.logger.debug(() => `Started test event handling for test run Id: ${testRunId}`);
    return deferredSpecCaptureExecution.execution();
  }

  public captureTestEvent(eventName: KarmaEventName, event: KarmaEvent): void | KarmaEventResult {
    return this.eventHandler.handleEvent(eventName, event);
  }

  public captureTestError(errorMsg: string) {
    this.logger.debug(() => `Test error processing requested with message: ${errorMsg}`);

    if (this.primaryTestEventProcessor?.isProcessing()) {
      this.logger.debug(() => `Sending test error event to test event processor with message: ${errorMsg}`);
      this.primaryTestEventProcessor.processTestErrorEvent(errorMsg);
    }
    if (this.watchModeTestEventProcessor?.isProcessing()) {
      this.logger.debug(() => `Sending test error event to watch mode test event processor with message: ${errorMsg}`);
      this.watchModeTestEventProcessor?.processTestErrorEvent(errorMsg);
    }
  }

  private createEventHandler(): MultiEventHandler<KarmaEventName, KarmaEventHandler> {
    const karmaEventHandler: MultiEventHandler<KarmaEventName, (eventData: KarmaEvent) => KarmaEventResult | void> =
      new MultiEventHandler(new SimpleLogger(this.logger, MultiEventHandler.name));

    karmaEventHandler.setDefaultHandler(event => {
      const isErrorEvent = event.name?.toLowerCase().includes('error');

      if (isErrorEvent) {
        this.logger.debug(() => `Received unregistered error event: ${event.name}`);
        this.logger.trace(
          () => `Data for received unregistered error event '${event.name}': ${JSON.stringify(event, null, 2)}`
        );

        this.captureTestError(`Error event: ${event.name}`);

        if (this.watchModeTestEventProcessor?.isProcessing()) {
          this.watchModeTestEventProcessor?.concludeProcessing();
        }
      } else {
        this.logger.debug(() => `Ignoring received karma event: ${event.name}`);
        this.logger.trace(() => `Data for ignored event '${event.name}': ${JSON.stringify(event, null, 2)}`);
      }
    });

    karmaEventHandler.setErrorHandler((eventName: KarmaEventName, error: Error, event: KarmaEvent) => {
      this.logger.error(() => `Error while handling received karma event '${eventName}': ${error}`);
      this.logger.trace(
        () => `Event data for received errored event '${eventName}': ${JSON.stringify(event, null, 2)}`
      );
    });

    karmaEventHandler.setEventHandler(KarmaEventName.Listening, event => {
      this.logger.debug(() => `Karma server on karma port ${event.port ?? '<unknown>'} is ready for requests`);
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    karmaEventHandler.setEventHandler(KarmaEventName.BrowsersReady, _event => {
      this.logger.debug(() => 'Browsers connected and ready for test execution');
      return { connectionStatus: KarmaConnectionStatus.Started };
    });

    karmaEventHandler.setEventHandler(KarmaEventName.RunStart, event => {
      const browserNames = event.browsers?.map(browser => browser.name)?.join(', ');
      this.logger.debug(() => `Test run started for browsers: ${browserNames ?? 'unknown'}`);

      if (this.watchModeTestEventProcessor?.isProcessing()) {
        this.watchModeTestEventProcessor.processTestErrorEvent('New test is starting');
      }
      this.currentTestCaptureSession?.testRunStarted(event.runId);

      if (!this.primaryTestEventProcessor.isProcessing() && this.watchModeTestEventProcessor) {
        const futureWatchModeProcessingCompletion = this.watchModeTestEventProcessor.beginProcessing();

        this.notifications.notifyStatus(
          StatusType.Busy,
          'Watch mode running tests in background...',
          futureWatchModeProcessingCompletion
        );
      }
    });

    karmaEventHandler.setEventHandler(KarmaEventName.BrowserStart, event => {
      this.logger.debug(() => `Test run started in browser: ${event.browser?.name ?? 'unknown'}`);
    });

    karmaEventHandler.setEventHandler(KarmaEventName.SpecComplete, event => {
      const eventProcessor = this.primaryTestEventProcessor.isProcessing()
        ? this.primaryTestEventProcessor
        : this.watchModeTestEventProcessor?.isProcessing()
        ? this.watchModeTestEventProcessor
        : undefined;

      if (!eventProcessor?.isProcessing()) {
        this.logger.debug(
          () =>
            `Not processing received spec id '${event.results?.id || '<none>'}' - ` +
            `Neither the test run nor watch mode test processors are currently active`
        );
        return;
      }

      const results: LightSpecCompleteResponse = event.results!;
      const fullName: string = [...results.suite, results.description].join(' ');
      const testId: string = results.id || `:${fullName}`;
      const testStatus: TestStatus = results.status;
      const browserName = `${event.browser?.name ?? '(Unknwon browser)'}`;

      const specResults: SpecCompleteResponse = {
        ...results,
        id: testId,
        fullName
      };

      this.logger.debug(
        () =>
          `Processing received spec id '${specResults.id || '<none>'}' ` +
          `with test processor: ${eventProcessor.constructor.name}`
      );

      eventProcessor.processTestResultEvent(specResults);

      const statusMsg =
        testStatus === TestStatus.Success
          ? `[SUCCESS] ✅ Passed - ${browserName}`
          : testStatus === TestStatus.Failed
          ? `[FAILURE] ❌ Failed - ${browserName}`
          : `[SKIPPED] Test Skipped - ${browserName}`;

      this.logger.debug(() => statusMsg);
    });

    karmaEventHandler.setEventHandler(KarmaEventName.BrowserComplete, event => {
      this.logger.debug(() => `Test run completed in browser: ${event.browser?.name ?? 'unknown'}`);
    });

    karmaEventHandler.setEventHandler(KarmaEventName.RunComplete, event => {
      const browserNames = event.browsers?.map(browser => browser.name)?.join(', ');
      this.logger.debug(
        () =>
          `Test run completed with status '${event.runStatus ?? 'unknown'}' ` +
          `for browsers: ${browserNames ?? 'unknown'}`
      );

      const testRunStatus = event.runStatus ?? TestRunStatus.Complete;

      const errorMsg =
        testRunStatus === TestRunStatus.Error
          ? 'Test run encountered an error'
          : testRunStatus === TestRunStatus.Timeout
          ? 'Test run timed out'
          : undefined;

      if (errorMsg) {
        this.logger.warn(
          () =>
            `${errorMsg} (Exit code: ${event.exitCode ?? '<unknown>'}) - ` +
            `${event.error?.split('\n')[0] || '<no message>'}`
        );
        this.captureTestError(errorMsg);
        return;
      }

      if (this.currentTestCaptureSession) {
        this.currentTestCaptureSession.testRunEnded(event.runId);
      } else {
        this.logger.debug(
          () => `Received '${event.name}' event with run Id '${event.runId}' while no requested user test capture`
        );
      }

      if (this.watchModeTestEventProcessor?.isProcessing()) {
        this.watchModeTestEventProcessor.concludeProcessing();
      }
    });

    karmaEventHandler.setEventHandler(KarmaEventName.BrowserError, event => {
      this.logger.trace(
        () =>
          `For browser: ${event.browser?.fullName ?? 'unknown'}\n` +
          `---> Received Karma event: ${JSON.stringify(event, null, 2)}`
      );
      const errorMsg = event.error ? `Browser Error - ${event.error}` : 'Browser Error';
      this.logger.error(() => `Browser error while listening for test events: ${errorMsg}`);

      this.captureTestError(errorMsg);

      if (!event.error?.toLowerCase()?.includes('(transport close)')) {
        return;
      }

      return {
        connectionStatus: KarmaConnectionStatus.Failed,
        error: errorMsg
      };
    });

    karmaEventHandler.setEventHandler(KarmaEventName.BrowserProcessFailure, event => {
      const errorMsg = event.error ? `Browser Failure - ${event.error}` : 'Browser Failure';
      this.logger.error(() => `Failure while listening for test events: ${errorMsg}`);

      this.captureTestError(errorMsg);

      return {
        connectionStatus: KarmaConnectionStatus.Failed,
        error: errorMsg
      };
    });

    karmaEventHandler.setEventHandler(KarmaEventName.Exit, () => {
      const exitMsg = 'Karma exited';
      this.logger.debug(() => exitMsg);

      this.captureTestError(exitMsg);

      return {
        connectionStatus: KarmaConnectionStatus.Failed,
        error: exitMsg
      };
    });

    return karmaEventHandler;
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
