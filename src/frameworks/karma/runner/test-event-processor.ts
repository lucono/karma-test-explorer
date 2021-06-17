import { Disposable } from "../../../api/disposable";
import { SpecCompleteResponse } from "./spec-complete-response";

export interface TestIdentification {
  testId: string,
  testName: string
}

export interface TestEventProcessor extends Disposable {
    
  beginProcessing(tests: TestIdentification[]): void;

  processTestResultEvent(testId: string, testResult: SpecCompleteResponse): void;

  concludeProcessing(): void;

  getProcessedEvents(): SpecCompleteResponse[];
}
