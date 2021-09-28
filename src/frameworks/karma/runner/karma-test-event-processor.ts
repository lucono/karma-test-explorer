import { EventEmitter } from 'vscode';
import { TestDecoration, TestEvent, TestInfo, TestSuiteInfo } from 'vscode-test-adapter-api';
import { TestResultEvent } from '../../../core/base/test-events';
import { TestGrouping } from '../../../core/base/test-grouping';
import { TestType } from '../../../core/base/test-infos';
import { TestResolver } from '../../../core/base/test-resolver';
import { TestResults } from '../../../core/base/test-results';
import { TestState } from '../../../core/base/test-state';
import { TestStatus } from '../../../core/base/test-status';
import { SuiteAggregateTestResultProcessor } from '../../../core/suite-aggregate-test-result-processor';
import { TestSuiteOrganizationOptions, TestSuiteOrganizer } from '../../../core/test-suite-organizer';
import { Disposable } from '../../../util/disposable/disposable';
import { Disposer } from '../../../util/disposable/disposer';
import { DeferredPromise } from '../../../util/future/deferred-promise';
import { Execution } from '../../../util/future/execution';
import { Logger } from '../../../util/logging/logger';
import { TestCapture } from './karma-test-event-listener';
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
}

export interface TestEventProcessingResults {
  processedSpecs: SpecCompleteResponse[];
  filteredEvents: TestEvent[];
}

export class KarmaTestEventProcessor {
  private readonly processedTestResults: Map<string, SpecCompleteResponse> = new Map();
  private readonly filteredTestResultEvents: Map<string, TestEvent> = new Map();
  private eventProcessingOptions?: TestEventProcessingOptions;
  private currentTestNames?: string[];
  private disposables: Disposable[] = [];
  private deferredProcessingResults?: DeferredPromise<TestEventProcessingResults>;

  public constructor(
    private readonly testResultEventEmitter: EventEmitter<TestResultEvent>,
    private readonly specToTestSuiteMapper: SpecResponseToTestSuiteInfoMapper,
    private readonly testSuiteOrganizer: TestSuiteOrganizer,
    private readonly suiteTestResultEmitter: SuiteAggregateTestResultProcessor,
    private readonly testGrouping: TestGrouping,
    private readonly projectRootPath: string,
    private readonly testsBasePath: string,
    private readonly testResolver: TestResolver,
    private readonly logger: Logger
  ) {
    this.disposables.push(logger, testResultEventEmitter);
  }

  public async processTestEvents(
    testExecution: Execution,
    testNames: string[] = [],
    eventProcessingOptions: TestEventProcessingOptions = defaultEventProcessingOptions
  ): Promise<TestEventProcessingResults> {
    if (this.isProcessing()) {
      this.concludeProcessing();
    }
    this.currentTestNames = testNames;
    this.eventProcessingOptions = eventProcessingOptions;

    const deferredProcessingResults: DeferredPromise<TestEventProcessingResults> = new DeferredPromise();
    this.deferredProcessingResults = deferredProcessingResults;

    testExecution.ended().then(() => {
      const isStillCurrentExecution = deferredProcessingResults === this.deferredProcessingResults;

      if (isStillCurrentExecution) {
        this.concludeProcessing();
      }
    });

    return deferredProcessingResults.promise();
  }

  private concludeProcessing(): void {
    if (this.isProcessing()) {
      const processedResults: TestEventProcessingResults = {
        processedSpecs: Array.from(this.processedTestResults.values()),
        filteredEvents: Array.from(this.filteredTestResultEvents.values())
      };
      this.deferredProcessingResults!.fulfill(processedResults);
      this.emitTestSuiteEvents();
    }

    this.processedTestResults.clear();
    this.filteredTestResultEvents.clear();
    this.currentTestNames = undefined;
    this.eventProcessingOptions = undefined;
    this.deferredProcessingResults = undefined;
  }

  public processTestErrorEvent(message: string) {
    if (!this.isProcessing()) {
      return;
    }
    this.deferredProcessingResults!.reject(message);
    this.concludeProcessing();
  }

  public processTestResultEvent(testResult: SpecCompleteResponse) {
    if (!this.isProcessing()) {
      return;
    }
    const testId = testResult.id;

    if (!this.isIncludedTest(testResult)) {
      this.logger.debug(() => `Skipping spec id '${testId}' - Not included in current test run`);
      return;
    }
    const processedTest = this.processedTestResults.get(testId);

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
    this.processedTestResults.set(testId, testResult);
  }

  public isProcessing(): boolean {
    return this.deferredProcessingResults !== undefined && !this.deferredProcessingResults.promise().isResolved();
  }

  private isIncludedTest(testResult: SpecCompleteResponse) {
    if (!this.currentTestNames) {
      return false;
    }
    const includeAll = this.currentTestNames.length === 0;

    return (
      includeAll || this.currentTestNames.some(includedSpecName => testResult.fullName.startsWith(includedSpecName))
    );
  }

  private emitTestResultEvent(testResult: SpecCompleteResponse) {
    const testId = testResult.id;

    if (!this.eventProcessingOptions?.emitTestEvents?.includes(testResult.status)) {
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

    let message: string | undefined;
    let decorations: TestDecoration[] | undefined;

    if (testResult.failureMessages.length > 0) {
      message = this.createErrorMessage(testResult);
      decorations = this.createDecorations(testResult) ?? [];

      if (decorations.length === 0 && test?.line !== undefined) {
        const { file, line } = test;
        const hover = `${testResult.fullName} \n-------- Failure: --------\n${message || 'Failed'}`;

        decorations = [
          {
            line,
            file,
            message: message || 'Failed',
            hover: `\`${hover.replace(/`/g, '\\`')}\``
          }
        ];
      }
    }

    if (test) {
      this.updateTestWithResultData(test, testResult);
    }

    const testResultEvent: TestEvent = {
      type: TestType.Test,
      test: test ?? testId,
      state: testState,
      tooltip: `${testResult.fullName}`,
      message,
      decorations
    };

    if (this.eventProcessingOptions?.emitTestStats) {
      testResultEvent.description = `(${testTimeDescription})`;
      testResultEvent.tooltip += `  (${resultDescription})`;
    }

    if (this.eventProcessingOptions?.filterTestEvents?.includes(testResult.status)) {
      this.logger.debug(() => `Filtering ${testResult.status} test result event for test id: ${testId}`);

      this.filteredTestResultEvents.set(testResult.id, testResultEvent);
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
    if (!this.eventProcessingOptions?.emitTestStats) {
      return;
    }

    const capturedTests: TestCapture = {
      [TestStatus.Failed]: [],
      [TestStatus.Success]: [],
      [TestStatus.Skipped]: []
    };

    Array.from(this.processedTestResults.values()).forEach(processedSpec =>
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
      Failed: this.testSuiteOrganizer.organizeTests(
        testResults.Failed,
        this.projectRootPath,
        this.testsBasePath,
        testOrganizationOptions
      ),
      Success: this.testSuiteOrganizer.organizeTests(
        testResults.Success,
        this.projectRootPath,
        this.testsBasePath,
        testOrganizationOptions
      ),
      Skipped: this.testSuiteOrganizer.organizeTests(
        testResults.Skipped,
        this.projectRootPath,
        this.testsBasePath,
        testOrganizationOptions
      )
    };

    this.suiteTestResultEmitter.processTestResults(organizedTestResults);
  }

  private updateTestWithResultData(test: TestInfo, testResult: SpecCompleteResponse) {
    test.label = testResult.description || test.label;
    test.fullName = testResult.fullName || test.fullName;
    test.file = testResult.filePath || test.file;
    test.line = testResult.line || test.line;
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

  private createErrorMessage(results: SpecCompleteResponse): string {
    const failureMessage = results.failureMessages[0];
    const message = failureMessage.split('\n')[0];

    if (!results.filePath) {
      return message;
    }

    try {
      const errorLineAndColumnCollection = failureMessage
        .substring(failureMessage.indexOf(results.filePath))
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

  private createDecorations(results: SpecCompleteResponse): TestDecoration[] | undefined {
    if (!results.filePath) {
      return undefined;
    }

    try {
      const decorations = results.failureMessages.map((failureMessage: string) => {
        const errorLineAndColumnCollection = failureMessage
          .substring(failureMessage.indexOf(results.filePath as string))
          .split(':');
        const lineNumber = parseInt(errorLineAndColumnCollection[1], undefined);
        return {
          line: lineNumber,
          message: failureMessage.split('\n')[0]
        };
      });

      if (decorations.some(x => isNaN(x.line))) {
        return undefined;
      }

      return decorations;
    } catch (error) {
      return undefined;
    }
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
