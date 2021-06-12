// import { TestState } from "../../../core/test-state";
import { TestResults } from "../../../api/test-results";
import { SpecCompleteResponse } from "./spec-complete-response";

export interface TestResultAccumulator {
  
  // processTestStateEvent(testId: string, testState: TestState, testRunId?: string): void;

  addTestResult(testId: string, testResult: SpecCompleteResponse): void;

  getTestResults(): TestResults;
}
