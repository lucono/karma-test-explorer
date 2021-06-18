import { TestEvent, TestDecoration, TestInfo, TestSuiteInfo } from "vscode-test-adapter-api";
import { TestState } from "../../../core/test-state";
import { SpecCompleteResponse } from "./spec-complete-response";
import { TestStatus } from "../../../api/test-status";
import { TestResultEvent } from "../../../api/test-events";
import { TestType } from "../../../api/test-infos";
import { EventEmitter } from "vscode";
import { TestResolver } from "../../../core/test-resolver";
// import { Execution } from "../../../api/execution";
import { Logger } from "../../../core/logger";
import { Disposable } from "../../../api/disposable";
import { TestCapture } from "./karma-test-event-listener";
import { SpecResponseToTestSuiteInfoMapper } from "./spec-response-to-test-suite-info-mapper";
import { TestResults } from "../../../api/test-results";
import { TestGrouping } from "../../../api/test-grouping";
import { SuiteAggregateTestResultProcessor } from "../../../core/suite-aggregate-test-result-processor";
import { TestSuiteOrganizer } from "../../../core/test-suite-organizer";
// import { TestEventProcessor, TestIdentification } from "./test-event-processor";
// import { TestSuiteTreeProcessor } from "../../../util/test-suite-tree-processor";

const DEFAULT_EVENT_PROCESSING_OPTIONS: TestEventProcessingOptions = {
  emitEvents: true
};

// export interface TestIdentification {
//   testId: string,
//   testName: string
// }

export interface TestEventProcessingOptions {
  emitEvents?: boolean;
  // bufferSkippedTestEvents?: boolean;
}

export class KarmaTestEventProcessor {
  private readonly processedTestResultEvents: Map<string, SpecCompleteResponse> = new Map();
  // private readonly bufferedTestResultEvents: Map<string, SpecCompleteResponse> = new Map();
  private eventProcessingOptions?: TestEventProcessingOptions;

  private currentTestNames?: string[];
  private isProcessingEvents: boolean = false;
  private disposables: Disposable[] = [];
  // private activeTestRunId?: string;

  public constructor(
    private readonly testResultEventEmitter: EventEmitter<TestResultEvent>,

    private readonly specToTestSuiteMapper: SpecResponseToTestSuiteInfoMapper,
    private readonly testSuiteOrganizer: TestSuiteOrganizer,
    // private readonly testSuiteTreeProcessor: TestSuiteTreeProcessor,
    private readonly suiteTestResultEmitter: SuiteAggregateTestResultProcessor,
    private readonly testGrouping: TestGrouping,
    private readonly projectRootPath: string,

    private readonly testResolver: TestResolver,
    private readonly logger: Logger,
    // eventProcessingOptions?: TestEventProcessingOptions
  ) {
    // this.eventProcessingOptions = eventProcessingOptions ?? DEFAULT_EVENT_PROCESSING_OPTIONS;
    this.disposables.push(logger, testResultEventEmitter);
  }

  public beginProcessing(
    testNames: string[] = [],
    eventProcessingOptions: TestEventProcessingOptions = DEFAULT_EVENT_PROCESSING_OPTIONS)
  {
    if (this.isProcessingEvents) {
      this.concludeProcessing();
    }
    this.processedTestResultEvents.clear();
    // this.bufferedTestResultEvents.clear();
    
    // const rootSuite = this.testResolver.resolveRootSuite();

    // const testsToProcess = tests.length > 0 ? tests.map(testIdInfo => testIdInfo.testId)
    //   : rootSuite ? [rootSuite.id]
    //   : [];

    // if (eventProcessingOptions.emitEvents) {
    //   const testRunStartedEvent: TestRunStartedEvent = { type: `started`, tests: testsToProcess };
    //   this.testResultEventEmitter.fire(testRunStartedEvent);
    // }

    this.currentTestNames = testNames;
    this.eventProcessingOptions = eventProcessingOptions;
    this.isProcessingEvents = true;
  }

  public concludeProcessing(): void {
    if (!this.isProcessingEvents) {
      return;
    }

    // if (this.bufferedTestResultEvents.size > 0) {
    //   this.logger.debug(() => `Processing ${this.bufferedTestResultEvents.size} buffered events`);
  
    //   this.bufferedTestResultEvents.forEach((testResult, testId) => {
    //     this.emitTestResultEvent(testId, testResult);
    //     this.processedTestResultEvents.set(testId, testResult);
    //   });
    //   this.bufferedTestResultEvents.clear();
    // }
    
    this.emitTestSuiteEvents();

    // if (this.eventProcessingOptions?.emitEvents) {
    //   const testRunFinishedEvent: TestRunFinishedEvent = { type: `finished` };
    //   this.testResultEventEmitter.fire(testRunFinishedEvent);
    // }

    this.currentTestNames = undefined;
    this.eventProcessingOptions = undefined;
    this.isProcessingEvents = false;
  }

  public getProcessedEvents(): SpecCompleteResponse[] {  // FIXME: Remove for test run processor
    this.concludeProcessing();
    return Array.from(this.processedTestResultEvents.values());
  }

  public processTestResultEvent(testId: string, testResult: SpecCompleteResponse) {
    if (!this.isProcessingEvents) {
      return;
    }

    if (!this.isIncludedTest(testResult)) {
      this.logger.debug(() => `Skipping spec id '${testId}' - Not included in current test run`);
      return;
    }
    // const testStatus: TestStatus = testResult.status;

    // if (!Object.values(TestStatus).includes(testStatus)) {  // FIXME: Not sure if scenario will ever happen
    //   this.logger.warn(`Skipping spec result with unknown test status: ${testStatus}`);

    //   this.logger.debug(() => 
    //     `Skipped spec result with unknown test status '${testStatus}': ` +
    //     `${JSON.stringify(testResult)}`);

    //   return;
    // }
    const processedTest = this.processedTestResultEvents.get(testId);

    if (processedTest && processedTest.status !== TestStatus.Skipped) {
      this.logger.debug(() => 
        `Ignoring duplicate previously processed test result. ` +
        `Processed test: id='${testId}', status='${testResult.status}'. ` +
        `Duplicate test: id='${processedTest.id}', status='${processedTest.status}'`);

      return;
    }
    
    this.emitTestRunningEvent(testId);

    // if (this.eventProcessingOptions.bufferSkippedTestEvents && testResult.status === TestStatus.Skipped) {
    //   this.logger.debug(() => 
    //     `Buffering test result with ` +
    //     `test id '${testId}' and status '${testResult.status}`);

    //   this.bufferedTestResultEvents.set(testId, testResult);
    //   return;
    // }

    this.emitTestResultEvent(testId, testResult);

    this.processedTestResultEvents.set(testId, testResult);
    // this.bufferedTestResultEvents.delete(testId);
  }

  public isProcessing(): boolean {
    return this.isProcessingEvents;
  }

  private isIncludedTest(testResult: SpecCompleteResponse) {
    if (!this.currentTestNames) {
      return false;
    }
    const includeAll = this.currentTestNames.length === 0;

    return includeAll || this.currentTestNames.some(
      includedSpecName => testResult.fullName.startsWith(includedSpecName)
    );
  }

  private emitTestSuiteEvents() {  // FIXME: Remove for test load processor
    if (!this.eventProcessingOptions?.emitEvents) {
      return;
    }
    
    const capturedTests: TestCapture = {
      [TestStatus.Failed]: [],
      [TestStatus.Success]: [],
      [TestStatus.Skipped]: []
    };

    Array.from(this.processedTestResultEvents.values()).forEach(
      processedSpec => capturedTests[processedSpec.status].push(processedSpec)
    );

    const failedTests: TestSuiteInfo = this.specToTestSuiteMapper.map(capturedTests[TestStatus.Failed]);
    const passedTests: TestSuiteInfo = this.specToTestSuiteMapper.map(capturedTests[TestStatus.Success]);
    const skippedTests: TestSuiteInfo = this.specToTestSuiteMapper.map(capturedTests[TestStatus.Skipped]);

    const testResults: TestResults = {
      [TestStatus.Failed]: failedTests,
      [TestStatus.Success]: passedTests,
      [TestStatus.Skipped]: skippedTests
    };

    const organizedTestResults: TestResults = this.testGrouping === TestGrouping.Suite ? testResults : {
      Failed: this.testSuiteOrganizer.groupByFolder(testResults.Failed, this.projectRootPath, false),
      Success: this.testSuiteOrganizer.groupByFolder(testResults.Success, this.projectRootPath, false),
      Skipped: this.testSuiteOrganizer.groupByFolder(testResults.Skipped, this.projectRootPath, false)
    };

    this.suiteTestResultEmitter.processTestResults(organizedTestResults);
    // return organizedTestResults;
  }

  private emitTestRunningEvent(testId: string) {
    if (!this.eventProcessingOptions?.emitEvents) {
      return;
    }
    const test: TestInfo | undefined = this.testResolver.resolveTest(testId);

    // if (!test) {
    //   return;
    // }

    const testEvent: TestEvent = {
      type: TestType.Test,
      test: test ?? testId,
      state: TestState.Running
    };
    this.testResultEventEmitter.fire(testEvent);
  }

  private emitTestResultEvent(testId: string, testResult: SpecCompleteResponse) {
    if (!this.eventProcessingOptions?.emitEvents) {
      return;
    }
    const test: TestInfo | undefined = this.testResolver.resolveTest(testId);

    // if (!test) {
    //   this.logger.debug(() => 
    //     `Not emitting test result event for test id '${testId}' - ` +
    //     `Loaded test was not found for test: ${testResult.fullName}`);

    //   return;
    // }
    
    const testState = this.mapTestResultToTestState(testResult.status);
    const testTime = `${testResult.timeSpentInMilliseconds} ms`;
    const testTimeDescription = testState === TestState.Skipped ? `Skipped` : testTime;

    const resultDescription = testState === TestState.Passed ? `Passed in ${testTime}`
      : testState === TestState.Failed ? `Failed in ${testTime}`
      : testState === TestState.Skipped ? `Skipped`
      : ``;

    let message: string | undefined;
    let decorations: TestDecoration[] | undefined;
    
    if (testResult.failureMessages.length > 0) {
      message = this.createErrorMessage(testResult);
      decorations = this.createDecorations(testResult) ?? [];

      if (decorations.length === 0 && test?.line !== undefined) {
        const { file, line } = test;
        const hover = `${testResult.fullName} \n` +
          `-------- Failure: --------\n` +
          `${message || 'Failed'}`;

        decorations = [{
          line,
          file,
          message: message || `Failed`,
          hover: `\`${hover.replace(/`/g, '\\`')}\``
        }];
      }
    }

    if (test) {
      this.updateTestWithResultData(test, testResult);
    }

    const testEvent: TestEvent = {
      type: TestType.Test,
      test: test ?? testId,
      state: testState,
      description: `(${testTimeDescription})`,
      tooltip: `${testResult.fullName}  (${resultDescription})`,
      message,
      decorations
    };

    this.testResultEventEmitter.fire(testEvent);
  }

  private updateTestWithResultData(test: TestInfo, testResult: SpecCompleteResponse) {
    test.label = testResult.description || test.label;
    test.fullName = testResult.fullName || test.fullName;
    test.file = testResult.filePath || test.file;
    test.line = testResult.line || test.line;
  }

  private mapTestResultToTestState(testStatus: TestStatus): TestState {
    switch (testStatus) {
      case TestStatus.Success: return TestState.Passed;
      case TestStatus.Failed: return TestState.Failed;
      case TestStatus.Skipped: return TestState.Skipped;
    }
  }

  private createErrorMessage(results: SpecCompleteResponse): string {
    const failureMessage = results.failureMessages[0];
    const message = failureMessage.split("\n")[0];

    if (!results.filePath) {
      return message;
    }

    try {
      const errorLineAndColumnCollection = failureMessage.substring(failureMessage.indexOf(results.filePath)).split(":");
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
        const errorLineAndColumnCollection = failureMessage.substring(failureMessage.indexOf(results.filePath as string)).split(":");
        const lineNumber = parseInt(errorLineAndColumnCollection[1], undefined);
        return {
          line: lineNumber,
          message: failureMessage.split("\n")[0],
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

  public dispose() {
    this.disposables.forEach(disposable => disposable.dispose());
  }
}
