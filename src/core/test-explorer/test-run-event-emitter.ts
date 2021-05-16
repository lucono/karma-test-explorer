import { TestEvent, TestRunStartedEvent, TestRunFinishedEvent, TestSuiteEvent, TestDecoration, TestInfo } from "vscode-test-adapter-api";
import { KarmaEvent } from "../../model/karma-event";
import { TestState } from "../../model/enums/test-state.enum";
import { SpecCompleteResponse } from "../../model/spec-complete-response";
import { TestType } from "../../model/enums/test-type.enum";
import { TestResult } from "../../model/enums/test-status.enum";
import * as vscode from "vscode";

export type TestRetriever = (testId: string) => TestInfo | undefined;

export class TestRunEventEmitter {
  public constructor(
    private readonly eventEmitterInterface: vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>,
    private readonly testRetriever: TestRetriever
  ) {}

  public emitTestStateEvent(testId: string, testState: TestState, testRunId?: string) {
    const test: TestInfo | undefined = this.testRetriever(testId);

    const testEvent: TestEvent = {
      type: TestType.Test,
      test: test ?? testId,
      state: testState
    };
    this.eventEmitterInterface.fire(testEvent);
  }

  public emitTestResultEvent(testId: string, karmaEvent: KarmaEvent) {
    const test: TestInfo | undefined = this.testRetriever(testId);
    
    const { results } = karmaEvent;
    const testState = this.mapTestResultToTestState(results.status);
    const testTime = `${results.timeSpentInMilliseconds} ms`;
    const testTimeDescription = testState === TestState.Skipped ? `Skipped` : testTime;

    const resultDescription = testState === TestState.Passed ? `Passed in ${testTime}`
      : testState === TestState.Failed ? `Failed in ${testTime}`
      : testState === TestState.Skipped ? `Skipped`
      : ``;

    let message: string | undefined;
    let decorations: TestDecoration[] | undefined;
    
    if (results.failureMessages.length > 0) {
      message = this.createErrorMessage(results);
      decorations = this.createDecorations(results) ?? [];

      if (decorations.length === 0 && test?.line !== undefined) {
        const { file, line } = test;

        decorations = [{
          line,
          file,
          message: `Failed`,
          hover: `/* Failed: ${results.fullName} */`
        }];
      }
    }

    const testEvent: TestEvent = {
      type: TestType.Test,
      test: test ?? testId,
      state: testState,
      description: `(${testTimeDescription})`,
      tooltip: `${results.fullName}  (${resultDescription})`,
      message,
      decorations
    };

    this.eventEmitterInterface.fire(testEvent);
  }

  private mapTestResultToTestState(testResult: TestResult): TestState {
    switch (testResult) {
      case TestResult.Success: return TestState.Passed;
      case TestResult.Failed: return TestState.Failed;
      case TestResult.Skipped: return TestState.Skipped;
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
}
