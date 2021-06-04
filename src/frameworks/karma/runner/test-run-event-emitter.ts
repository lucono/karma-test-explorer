import { TestState } from "../../../core/test-state";
import { SpecCompleteResponse } from "./spec-complete-response";
export interface TestRunEventEmitter {
  
  emitTestStateEvent(testId: string, testState: TestState, testRunId?: string): void;

  emitTestResultEvent(testId: string, testResult: SpecCompleteResponse): void;
}
