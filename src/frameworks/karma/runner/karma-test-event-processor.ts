import { isAbsolute } from 'path';
import { EventEmitter } from 'vscode';
import { TestDecoration, TestEvent, TestInfo, TestSuiteInfo } from 'vscode-test-adapter-api';
import { TestResultEvent } from '../../../core/base/test-events';
import { TestGrouping } from '../../../core/base/test-grouping';
import { TestType } from '../../../core/base/test-infos';
import { TestResolver } from '../../../core/base/test-resolver';
import { TestResults } from '../../../core/base/test-results';
import { TestState } from '../../../core/base/test-state';
import { TestStatus } from '../../../core/base/test-status';
import { SpecLocation, SpecLocator } from '../../../core/spec-locator';
import { SuiteAggregateTestResultProcessor } from '../../../core/suite-aggregate-test-result-processor';
import { TestSuiteOrganizationOptions, TestSuiteOrganizer } from '../../../core/test-suite-organizer';
import { Disposable } from '../../../util/disposable/disposable';
import { Disposer } from '../../../util/disposable/disposer';
import { DeferredPromise } from '../../../util/future/deferred-promise';
import { Logger } from '../../../util/logging/logger';
import { escapeForRegExp } from '../../../util/utils';
import { TestCapture } from './karma-test-listener';
import { SpecCompleteResponse } from './spec-complete-response';
import { SpecResponseToTestSuiteInfoMapper } from './spec-response-to-test-suite-info-mapper';

const defaultEventProcessingOptions: TestEventProcessingOptions = {
  filterTestEvents: [],
  emitTestEvents: Object.values(TestStatus),
  emitTestStats: true
};

export interface TestEventProcessingOptions {
  filterTestEvents?: TestStatus[];
  emitTestEvents?: TestStatus[];
  emitTestStats?: boolean;
  testEventIntervalTimeout?: number;
}

export interface TestEventProcessingResults {
  processedSpecs: SpecCompleteResponse[];
  filteredEvents: TestEvent[];
}

interface ProcessingInfo {
  testNames: string[];
  eventProcessingOptions: TestEventProcessingOptions;
  processedTestResults: Map<string, SpecCompleteResponse>;
  filteredTestResultEvents: Map<string, TestEvent>;
  deferredProcessingResults: DeferredPromise<TestEventProcessingResults>;
}

export class KarmaTestEventProcessor {
  private currentProcessingInfo?: ProcessingInfo;
  private disposables: Disposable[] = [];

  public constructor(
    private readonly testResultEventEmitter: EventEmitter<TestResultEvent>,
    private readonly specToTestSuiteMapper: SpecResponseToTestSuiteInfoMapper,
    private readonly testSuiteOrganizer: TestSuiteOrganizer,
    private readonly suiteTestResultEmitter: SuiteAggregateTestResultProcessor,
    private readonly specLocator: SpecLocator,
    private readonly testGrouping: TestGrouping,
    private readonly testResolver: TestResolver,
    private readonly logger: Logger
  ) {
    this.disposables.push(logger, testResultEventEmitter);
  }

  public async processTestEvents(
    testNames: string[] = [],
    eventProcessingOptions: TestEventProcessingOptions = defaultEventProcessingOptions
  ): Promise<TestEventProcessingResults> {
    this.logger.debug(() => `Request to begin test event processing`);

    if (this.isProcessing()) {
      this.logger.debug(() => `Conclude current test processing before commencing new processing`);
      this.concludeProcessing();
    }

    this.logger.debug(() => `Proceeding to begin processing test events`);
    const deferredProcessingResults: DeferredPromise<TestEventProcessingResults> = new DeferredPromise();

    this.currentProcessingInfo = {
      testNames,
      eventProcessingOptions,
      deferredProcessingResults,
      processedTestResults: new Map(),
      filteredTestResultEvents: new Map()
    };

    const testEventIntervalTimeout = eventProcessingOptions.testEventIntervalTimeout;

    if (testEventIntervalTimeout) {
      deferredProcessingResults.autoReject(
        testEventIntervalTimeout,
        `Exceeded ${eventProcessingOptions.testEventIntervalTimeout} ms timeout while waiting for first test result`
      );
    }

    return deferredProcessingResults.promise();
  }

  public concludeProcessing(): void {
    this.logger.debug(() => `Request to conclude test event processing`);

    if (this.currentProcessingInfo && this.isProcessing()) {
      this.logger.debug(() => `Test event processor is currently processing - Concluding current processing`);

      const processedResults: TestEventProcessingResults = {
        processedSpecs: Array.from(this.currentProcessingInfo.processedTestResults.values()),
        filteredEvents: Array.from(this.currentProcessingInfo.filteredTestResultEvents.values())
      };
      this.currentProcessingInfo.deferredProcessingResults!.fulfill(processedResults);
      this.emitTestSuiteEvents();
    }

    this.currentProcessingInfo = undefined;
  }

  public processTestErrorEvent(message: string) {
    this.logger.debug(() => `Request to process test error event with message: ${message}`);

    if (!this.isProcessing()) {
      this.logger.debug(() => `Ignoring test error event - Processor not currently processing`);
      return;
    }
    this.currentProcessingInfo!.deferredProcessingResults.reject(message);
    this.concludeProcessing();
  }

  public processTestResultEvent(testResult: Readonly<SpecCompleteResponse>) {
    this.logger.debug(() => `Request to process test result event having status: ${testResult.status}`);
    this.logger.trace(() => `Test result event for processing has Id: ${testResult.id}`);

    if (!this.isProcessing()) {
      this.logger.debug(() => `Ignoring test result event - Processor not currently processing`);
      return;
    }

    const testEventIntervalTimeout = this.currentProcessingInfo?.eventProcessingOptions.testEventIntervalTimeout;

    if (testEventIntervalTimeout) {
      this.logger.debug(
        () => `Resetting elapsed test event interval time to timeout value: ${testEventIntervalTimeout}`
      );

      this.currentProcessingInfo?.deferredProcessingResults.autoReject(
        testEventIntervalTimeout,
        `Exceeded ${testEventIntervalTimeout} ms timeout while waiting for new test results`
      );
    }

    const testId = testResult.id;

    if (!this.isIncludedTest(testResult)) {
      this.logger.debug(() => `Skipping spec id '${testId}' - Not included in current test run`);
      return;
    }
    const processedTest = this.currentProcessingInfo!.processedTestResults.get(testId);

    if (processedTest && testResult.status === TestStatus.Skipped) {
      this.logger.debug(
        () =>
          'Ignoring skipped update for previously processed test result. ' +
          `Processed test: id='${testId}', status='${testResult.status}'. ` +
          `Duplicate test: id='${processedTest.id}', status='${processedTest.status}'`
      );

      return;
    }

    this.emitTestResultEvent(testResult);
    this.currentProcessingInfo!.processedTestResults.set(testId, testResult);
  }

  public isProcessing(): boolean {
    return (
      this.currentProcessingInfo !== undefined &&
      !this.currentProcessingInfo.deferredProcessingResults.promise().isResolved()
    );
  }

  private isIncludedTest(testResult: SpecCompleteResponse) {
    if (!this.currentProcessingInfo) {
      return false;
    }
    const includeAll = this.currentProcessingInfo.testNames.length === 0;

    return (
      includeAll ||
      this.currentProcessingInfo.testNames.some(includedSpecName => testResult.fullName.startsWith(includedSpecName))
    );
  }

  private emitTestResultEvent(testResult: Readonly<SpecCompleteResponse>) {
    const testId = testResult.id;

    if (!this.currentProcessingInfo?.eventProcessingOptions.emitTestEvents?.includes(testResult.status)) {
      this.logger.debug(
        () =>
          `Skipping test result event for test id ${testId} - ` +
          `Emit events not enabled for test status ${testResult.status}`
      );
      return;
    }
    this.logger.debug(() => `Processing test result event for test id: ${testId}`);

    const test: TestInfo | undefined = this.testResolver.resolveTest(testId);
    const testState = this.mapTestResultToTestState(testResult.status);
    const testTime = `${testResult.timeSpentInMilliseconds} ms`;
    const testTimeDescription = testState === TestState.Skipped ? 'Skipped' : testTime;

    const resultDescription =
      testState === TestState.Passed
        ? `Passed in ${testTime}`
        : testState === TestState.Failed
        ? `Failed in ${testTime}`
        : testState === TestState.Skipped
        ? 'Skipped'
        : '';

    const candidateSpecLocations = this.specLocator.getSpecLocations(testResult.suite, testResult.description, true);

    const relativeTestLocation: SpecLocation | undefined =
      candidateSpecLocations.length === 1 ? candidateSpecLocations[0] : undefined;

    this.logger.debug(
      () =>
        `Relative test location from ${candidateSpecLocations.length} resulting candidates from lookup: ` +
        `${relativeTestLocation ? JSON.stringify(relativeTestLocation, null, 2) : '<none>'}`
    );

    const testResultForErrorReporting: SpecCompleteResponse = {
      ...testResult,
      filePath: relativeTestLocation?.file,
      line: relativeTestLocation?.line,
      failureMessages: testResult.failureMessages.map(message => decodeURIComponent(message))
    };

    const failureMessage = this.createFailureMessage(testResultForErrorReporting);
    const failureDecorations = this.createTestFailureDecorations(testResultForErrorReporting);

    if (test) {
      this.updateTestWithResultData(test, testResult);
    }

    const testResultEvent: TestEvent = {
      type: TestType.Test,
      test: test ?? testId,
      state: testState,
      tooltip: `${testResult.fullName}`,
      message: failureMessage,
      decorations: failureDecorations
    };

    if (this.currentProcessingInfo.eventProcessingOptions.emitTestStats) {
      testResultEvent.description = `(${testTimeDescription})`;
      testResultEvent.tooltip += `  (${resultDescription})`;
    }

    if (this.currentProcessingInfo.eventProcessingOptions.filterTestEvents?.includes(testResult.status)) {
      this.logger.debug(() => `Filtering ${testResult.status} test result event for test id: ${testId}`);

      this.currentProcessingInfo.filteredTestResultEvents.set(testResult.id, testResultEvent);
      return;
    }

    const testRunningEvent: TestEvent = {
      type: TestType.Test,
      test: test ?? testId,
      state: TestState.Running
    };
    this.testResultEventEmitter.fire(testRunningEvent);
    this.testResultEventEmitter.fire(testResultEvent);
  }

  private emitTestSuiteEvents() {
    if (!this.currentProcessingInfo?.eventProcessingOptions.emitTestStats) {
      return;
    }

    const capturedTests: TestCapture = {
      [TestStatus.Failed]: [],
      [TestStatus.Success]: [],
      [TestStatus.Skipped]: []
    };

    Array.from(this.currentProcessingInfo.processedTestResults.values()).forEach(processedSpec =>
      capturedTests[processedSpec.status].push(processedSpec)
    );

    const failedTests: TestSuiteInfo = this.specToTestSuiteMapper.map(capturedTests[TestStatus.Failed]);
    const passedTests: TestSuiteInfo = this.specToTestSuiteMapper.map(capturedTests[TestStatus.Success]);
    const skippedTests: TestSuiteInfo = this.specToTestSuiteMapper.map(capturedTests[TestStatus.Skipped]);

    const testResults: TestResults = {
      [TestStatus.Failed]: failedTests,
      [TestStatus.Success]: passedTests,
      [TestStatus.Skipped]: skippedTests
    };

    const testOrganizationOptions: TestSuiteOrganizationOptions = {
      testGrouping: this.testGrouping,
      flattenSingleChildFolders: false,
      flattenSingleSuiteFiles: false
    };

    const organizedTestResults: TestResults = {
      Failed: this.testSuiteOrganizer.organizeTests(testResults.Failed, testOrganizationOptions),
      Success: this.testSuiteOrganizer.organizeTests(testResults.Success, testOrganizationOptions),
      Skipped: this.testSuiteOrganizer.organizeTests(testResults.Skipped, testOrganizationOptions)
    };

    this.suiteTestResultEmitter.processTestResults(organizedTestResults);
  }

  private updateTestWithResultData(test: TestInfo, testResult: SpecCompleteResponse) {
    test.label = testResult.description || test.label;
    test.fullName = testResult.fullName || test.fullName;
    test.file = testResult.filePath || test.file;
    test.line = testResult.line ?? test.line;
  }

  private mapTestResultToTestState(testStatus: TestStatus): TestState {
    switch (testStatus) {
      case TestStatus.Success:
        return TestState.Passed;
      case TestStatus.Failed:
        return TestState.Failed;
      case TestStatus.Skipped:
        return TestState.Skipped;
    }
  }

  private createFailureMessage(testResult: SpecCompleteResponse): string | undefined {
    if (testResult.failureMessages.length === 0) {
      return;
    }
    const failureMessage = testResult.failureMessages[0] || 'Failed';
    const message = failureMessage.split('\n')[0];

    if (!testResult.filePath) {
      return message;
    }

    try {
      const errorLineAndColumnCollection = failureMessage
        .substring(failureMessage.indexOf(testResult.filePath))
        .split(':');
      const lineNumber = parseInt(errorLineAndColumnCollection[1], undefined);
      const columnNumber = parseInt(errorLineAndColumnCollection[2], undefined);

      if (isNaN(lineNumber) || isNaN(columnNumber)) {
        return failureMessage;
      }

      return `${message} (line:${lineNumber} column:${columnNumber})`;
    } catch (error) {
      return failureMessage;
    }
  }

  private createTestFailureDecorations(testResult: SpecCompleteResponse): TestDecoration[] | undefined {
    if (testResult.failureMessages.length === 0) {
      return;
    }
    this.logger.debug(() => `Creating detailed test failure decorations for test id: ${testResult.id}`);

    let failureDecorations: TestDecoration[] = [];
    const testDescriptionHoverHeader = `'${testResult.fullName.replace(/'/g, "\\'")}'\n---`;
    const relativeFilePath = testResult.filePath && !isAbsolute(testResult.filePath) ? testResult.filePath : undefined;

    this.logger.debug(() => `Using relative file path for test id '${testResult.id}': ${relativeFilePath || '<none>'}`);

    if (relativeFilePath) {
      try {
        const decorations = testResult.failureMessages.map((failureMessage): TestDecoration => {
          const errorLineAndColumnCollection = failureMessage
            .substring(failureMessage.indexOf(relativeFilePath))
            .split(':');

          const fileAndLinePattern = new RegExp(
            `\\([^)]*${escapeForRegExp(relativeFilePath)}[^:)]*:(\\d+):(\\d+)\\)`,
            'gm'
          );

          const sanitizedFailureMessage = failureMessage.replace(fileAndLinePattern, `(${relativeFilePath}:$1:$2)`);
          const lineNumber = parseInt(errorLineAndColumnCollection[1], undefined);
          const hoverMessage = `${testDescriptionHoverHeader}\n${sanitizedFailureMessage}`;

          return {
            line: lineNumber - 1,
            message: sanitizedFailureMessage.split('\n')[0],
            hover: hoverMessage
          };
        });

        if (decorations.every(decoration => !isNaN(decoration.line))) {
          failureDecorations = decorations;
        } else {
          this.logger.debug(
            () =>
              `Aborting creation of detailed test failure decorations for test id '${testResult.id}' - ` +
              `Could not determine some failure line positions`
          );
          this.logger.trace(
            () => `Test result with undetermined failure line positions: ${JSON.stringify(testResult, null, 2)}`
          );
        }
      } catch (error) {
        this.logger.debug(
          () => `Error while creating detailed test failure decorations for test id '${testResult.id}': ${error}`
        );
      }
    } else {
      this.logger.debug(
        () =>
          `Not able to create detailed test failure decoration - ` +
          `Could not determine relative file path for test id: ${testResult.id}`
      );
    }

    if (failureDecorations?.length === 0 && testResult.line !== undefined) {
      const failureMessage = testResult.failureMessages[0]?.split('\n')[0] || 'Failed';
      const hoverMessage = `${testDescriptionHoverHeader}\n${testResult.failureMessages.join('\n')}`;

      failureDecorations = [{ line: testResult.line, message: failureMessage, hover: hoverMessage }];
    }
    return failureDecorations;
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
