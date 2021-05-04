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

  public emitTestStateEvent(test: TestInfo | string, testState: TestState, testRunId?: string) {
    const testEvent: TestEvent = {
      type: TestType.Test,
      test,
      state: testState
    };
    this.eventEmitterInterface.fire(testEvent);
  }

  public emitTestResultEvent(test: TestInfo | string, karmaEvent: KarmaEvent) {
    // const testId: string = typeof test === 'string' ? test : test.id;
    const testInfo: TestInfo | undefined = typeof test === 'string' ? undefined : test;
    const { results } = karmaEvent;
    const testResultMapper = new TestResultToTestStateMapper();
    const testState = testResultMapper.map(results.status);
    const testTime = `${results.timeSpentInMilliseconds} ms`;

    const resultDescription = testState === TestState.Passed ? `Passed in ${testTime}`
      : testState === TestState.Failed ? `Failed in ${testTime}`
      : `${testTime}`;

    let message: string | undefined;
    let decorations: TestDecoration[] | undefined;
    
    if (results.failureMessages.length > 0) {
      message = this.createErrorMessage(results);
      decorations = this.createDecorations(results) ?? [];

      if (decorations.length === 0 && testInfo?.line) {
        const { file, line } = testInfo;

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
      test,
      state: testState,
      description: testTime,
      tooltip: `${results.fullName}  (${resultDescription})`,
      message,
      decorations,
      // testRunId  // FIXME: testRunId currently not passed
    };

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
