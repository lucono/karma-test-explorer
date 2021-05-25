import { TestEvent, TestDecoration, TestInfo } from "vscode-test-adapter-api";
import { TestState } from "../../../core/test-state";
import { SpecCompleteResponse } from "./spec-complete-response";
import { TestStatus } from "../../../api/test-status";
import { TestRunEvent } from "../../../api/test-events";
import { TestType } from "../../../api/test-infos";
import { EventEmitter } from "vscode";
import { TestResolver } from "./test-resolver";

// export type TestRetriever = (testId: string) => TestInfo | undefined;

export class TestRunEventEmitter {
  public constructor(
    private readonly eventEmitterInterface: EventEmitter<TestRunEvent>,
    private readonly testResolver: TestResolver
  ) {}

  public emitTestStateEvent(testId: string, testState: TestState, testRunId?: string) {
    const test: TestInfo | undefined = this.testResolver.resolveTest(testId);

    const testEvent: TestEvent = {
      type: TestType.Test,
      test: test ?? testId,
      state: testState
    };
    this.eventEmitterInterface.fire(testEvent);
  }

  public emitTestResultEvent(testId: string, testResult: SpecCompleteResponse) {
    const test: TestInfo | undefined = this.testResolver.resolveTest(testId);
    
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

    const testEvent: TestEvent = {
      type: TestType.Test,
      test: test ?? testId,
      state: testState,
      description: `(${testTimeDescription})`,
      tooltip: `${testResult.fullName}  (${resultDescription})`,
      message,
      decorations
    };

    this.eventEmitterInterface.fire(testEvent);
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
}
