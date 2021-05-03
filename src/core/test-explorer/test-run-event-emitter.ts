import { TestEvent, TestRunStartedEvent, TestRunFinishedEvent, TestSuiteEvent, TestDecoration, TestInfo } from "vscode-test-adapter-api";
import { KarmaEvent } from "../../model/karma-event";
import { TestState } from "../../model/enums/test-state.enum";
import { TestResultToTestStateMapper } from "./test-result-to-test-state.mapper";
import { SpecCompleteResponse } from "../../model/spec-complete-response";
import * as vscode from "vscode";
import { TestType } from "../../model/enums/test-type.enum";

export class TestRunEventEmitter {
  public constructor(
    private readonly eventEmitterInterface: vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>
  ) {}

  public emitTestStateEvent(test: TestInfo | string, testState: TestState) {
    const testEvent: TestEvent = {
      type: TestType.Test,
      test,
      state: testState
    };
    this.eventEmitterInterface.fire(testEvent);
  }

  public emitTestResultEvent(test: TestInfo | string, karmaEvent: KarmaEvent) {
    const { results } = karmaEvent;
    const testResultMapper = new TestResultToTestStateMapper();
    const testState = testResultMapper.map(results.status);
    const testTime = `${results.timeSpentInMilliseconds} ms`;

    const resultDescription = testState === TestState.Passed ? `Passed in ${testTime}`
      : testState === TestState.Failed ? `Failed in ${testTime}`
      : `${testTime}`;

    const testEvent: TestEvent = {
      type: TestType.Test,
      test,
      state: testState,
      description: testTime,
      tooltip: `${results.fullName}  (${resultDescription})`
    };

    if (results.failureMessages.length > 0) {
      const decorations = this.createDecorations(results);
      const message = this.createErrorMessage(results);
      
      testEvent.decorations = decorations;
      testEvent.message = message;
    }

    this.eventEmitterInterface.fire(testEvent);
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
