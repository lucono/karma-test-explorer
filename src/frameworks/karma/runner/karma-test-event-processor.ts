import { EventEmitter } from 'vscode';
import { RetireEvent, TestDecoration, TestEvent, TestInfo } from 'vscode-test-adapter-api';
import { TestDefinition } from '../../../core/base/test-definition';
import { TestResultEvent } from '../../../core/base/test-events';
import { TestType } from '../../../core/base/test-infos';
import { TestResults } from '../../../core/base/test-results';
import { TestState } from '../../../core/base/test-state';
import { TestStatus } from '../../../core/base/test-status';
import { TestHelper } from '../../../core/test-helper';
import { TestLocator } from '../../../core/test-locator';
import { StoredTestResolver } from '../../../core/test-store';
import { TestSuiteFolderGroupingOptions, TestSuiteOrganizer } from '../../../core/util/test-suite-organizer';
import { Disposable } from '../../../util/disposable/disposable';
import { Disposer } from '../../../util/disposable/disposer';
import { FileHandler } from '../../../util/file-handler';
import { DeferredPromise } from '../../../util/future/deferred-promise';
import { Logger } from '../../../util/logging/logger';
import { escapeForRegExp } from '../../../util/utils';
import { TestCapture } from './karma-test-listener';
import { SpecCompleteResponse } from './spec-complete-response';
import { SuiteAggregateTestResultProcessor } from './suite-aggregate-test-result-processor';
import { TestBuilder } from './test-builder';

const defaultEventProcessingOptions: TestEventProcessingOptions = {
  filterTestEvents: [],
  emitTestEvents: Object.values(TestStatus),
  emitTestStats: true,
  retireExcludedTests: false
};

export interface TestEventProcessingOptions {
  readonly filterTestEvents?: TestStatus[];
  readonly emitTestEvents?: TestStatus[];
  readonly emitTestStats?: boolean;
  readonly retireExcludedTests?: boolean;
  readonly testEventIntervalTimeout?: number;
}

export interface TestEventProcessingResults {
  readonly processedSpecs: SpecCompleteResponse[];
  readonly filteredEvents: TestEvent[];
}

interface ProcessingInfo {
  readonly testNames: string[];
  readonly eventProcessingOptions: TestEventProcessingOptions;
  readonly processedTestResults: Map<string, SpecCompleteResponse>;
  readonly filteredTestResultEvents: Map<string, TestEvent>;
  readonly excludedTestResults: SpecCompleteResponse[];
  readonly deferredProcessingResults: DeferredPromise<TestEventProcessingResults>;
}

export class KarmaTestEventProcessor {
  private currentProcessingInfo?: ProcessingInfo;
  private disposables: Disposable[] = [];

  public constructor(
    private readonly testResultEventEmitter: EventEmitter<TestResultEvent>,
    private readonly testRetireEventEmitter: EventEmitter<RetireEvent>,
    private readonly testBuilder: TestBuilder,
    private readonly testSuiteOrganizer: TestSuiteOrganizer,
    private readonly suiteTestResultEmitter: SuiteAggregateTestResultProcessor,
    private readonly testLocator: TestLocator,
    private readonly testResolver: StoredTestResolver,
    private readonly fileHandler: FileHandler,
    private readonly testHelper: TestHelper,
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
      filteredTestResultEvents: new Map(),
      excludedTestResults: []
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
      this.retireExcludedTests();
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
      this.currentProcessingInfo?.excludedTestResults.push(testResult);
      return;
    }
    const processedTest = this.currentProcessingInfo!.processedTestResults.get(testId);

    if (processedTest) {
      this.logger.warn(
        () =>
          'Ignoring duplicate result for already processed test result. ' +
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

    const testDefinitionResults = this.testLocator.getTestDefinitions(testResult.suite, testResult.description);
    const candidateTestDefinitions = testDefinitionResults.map(testDefinitionResult => testDefinitionResult.test);

    const matchedTestDefinitions = candidateTestDefinitions.filter(candidateTestDefinition =>
      test?.file && test?.line !== undefined
        ? candidateTestDefinition.file === test.file && candidateTestDefinition.line === test.line
        : true
    );

    let failureMessage: string | undefined;
    let failureDecorations: TestDecoration[] | undefined;

    if (testResult.failureMessages.length > 0) {
      const testHasExistingMessage = !!test?.message;

      failureDecorations = this.createTestFailureDecorations(testResult, matchedTestDefinitions);

      const failureMessages = failureDecorations?.length
        ? failureDecorations.map(decoration => decoration.hover?.split('\n---\n')[1])
        : testResult.failureMessages.map(failureMessage => decodeURIComponent(failureMessage));

      failureMessage = (testHasExistingMessage ? '\n\n---\n\n' : '') + failureMessages.join('\n\n---\n\n');
    }

    if (test) {
      this.updateTestWithResultData(
        test,
        testResult,
        matchedTestDefinitions.length === 1 ? matchedTestDefinitions[0] : undefined
      );
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

  private retireExcludedTests() {
    if (!this.currentProcessingInfo?.eventProcessingOptions.retireExcludedTests) {
      return;
    }
    const excludedTestIds = this.currentProcessingInfo.excludedTestResults.map(excludedSpec => excludedSpec.id);

    if (excludedTestIds.length === 0) {
      return;
    }

    this.logger.debug(() => `Retiring ${excludedTestIds.length ?? 0} excluded test ids`);
    this.logger.trace(() => `Excluded test ids to retire: ${JSON.stringify(excludedTestIds)}`);

    const testRetireEvent: RetireEvent = { tests: excludedTestIds };
    this.testRetireEventEmitter.fire(testRetireEvent);
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

    const failedTests = this.testBuilder.buildTests(capturedTests[TestStatus.Failed]);
    const passedTests = this.testBuilder.buildTests(capturedTests[TestStatus.Success]);
    const skippedTests = this.testBuilder.buildTests(capturedTests[TestStatus.Skipped]);

    const folderGroupingOptions: TestSuiteFolderGroupingOptions = {
      flattenSingleChildFolders: false,
      flattenSingleSuiteFiles: false
    };

    const organizedTestResults: TestResults = {
      Failed: this.testSuiteOrganizer.organizeTests(failedTests, folderGroupingOptions),
      Success: this.testSuiteOrganizer.organizeTests(passedTests, folderGroupingOptions),
      Skipped: this.testSuiteOrganizer.organizeTests(skippedTests, folderGroupingOptions)
    };

    this.suiteTestResultEmitter.processTestResults(organizedTestResults);
  }

  private updateTestWithResultData(test: TestInfo, testResult: SpecCompleteResponse, testDefinition?: TestDefinition) {
    const activeState = this.testHelper.getTestActiveState(testDefinition, test.activeState);
    const updatedLabel = this.testHelper.getTestLabel(testResult.description, testDefinition, activeState);
    const updatedTooltip = this.testHelper.getTestTooltip(testResult.fullName, activeState);

    test.activeState = activeState;
    test.label = updatedLabel;
    test.fullName = testResult.fullName;
    test.tooltip = updatedTooltip;
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

  private createTestFailureDecorations(
    testResult: Readonly<SpecCompleteResponse>,
    candidateTestDefinitions: readonly TestDefinition[]
  ): TestDecoration[] | undefined {
    if (testResult.failureMessages.length === 0) {
      return;
    }

    const decodedFailureMessages = testResult.failureMessages.map(message => decodeURIComponent(message));

    const matchingTestDefinitionsForFailure = candidateTestDefinitions.filter(candidateTestDefinition => {
      const relativeTestFilePath = this.fileHandler.getFileRelativePath(candidateTestDefinition.file);
      return decodedFailureMessages.some(failureMessage => failureMessage.includes(relativeTestFilePath));
    });

    const testDefinition =
      matchingTestDefinitionsForFailure.length === 1 ? matchingTestDefinitionsForFailure[0] : undefined;

    if (!testDefinition) {
      this.logger.debug(
        () =>
          `Cannot create test failure decorations for test id '${testResult.id}' - ` +
          `${matchingTestDefinitionsForFailure.length === 0 ? 'No' : 'Multiple'} ` +
          `(${matchingTestDefinitionsForFailure.length}) candidate test definitions ` +
          `matched the file of the error stack. Candidate test definitions: ` +
          `${JSON.stringify(candidateTestDefinitions)}`
      );
      return;
    }

    this.logger.debug(() => `Creating detailed test failure decorations for test id: ${testResult.id}`);

    const testDescriptionHoverHeader = `'${testResult.fullName.replace(/'/g, "\\'")}'\n---`;
    let failureDecorations: TestDecoration[] = [];

    try {
      const decorations = decodedFailureMessages.map((failureMessage): TestDecoration => {
        const relativeTestFilePath = this.fileHandler.getFileRelativePath(testDefinition.file);

        const errorLineAndColumnCollection = failureMessage
          .substring(failureMessage.indexOf(relativeTestFilePath))
          .split(':');

        const fileAndLinePattern = new RegExp(
          `\\([^)]*${escapeForRegExp(relativeTestFilePath)}[^:)]*:(\\d+):(\\d+)\\)`,
          'gm'
        );

        const sanitizedFailureMessage = failureMessage.replace(fileAndLinePattern, `(${relativeTestFilePath}:$1:$2)`);
        const lineNumber = parseInt(errorLineAndColumnCollection[1]);
        const hoverMessage = `${testDescriptionHoverHeader}\n${sanitizedFailureMessage}`;

        return {
          file: testDefinition.file,
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

    if (failureDecorations.length === 0) {
      const failureMessage = decodedFailureMessages[0]?.split('\n')[0] || 'Failed';
      const hoverMessage = `${testDescriptionHoverHeader}\n${decodedFailureMessages.join('\n')}`;

      failureDecorations = [
        {
          file: testDefinition.file,
          line: testDefinition.line,
          message: failureMessage,
          hover: hoverMessage
        }
      ];
    }
    return failureDecorations;
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
