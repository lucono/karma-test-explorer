import { SpecCompleteResponse } from "./spec-complete-response";
import { TestEventProcessor, TestIdentification } from "./test-event-processor";

export class KarmaAmbientTestEventProcessor implements TestEventProcessor {

  public beginProcessing(tests: TestIdentification[]): void {
    throw new Error("Method not implemented.");
  }
  
  public processTestResultEvent(testId: string, testResult: SpecCompleteResponse): void {
    throw new Error("Method not implemented.");
  }

  public concludeProcessing(): void {
    throw new Error("Method not implemented.");
  }

  public getProcessedEvents(): SpecCompleteResponse[] {
    throw new Error("Method not implemented.");
  }

  public dispose(): void {
    throw new Error("Method not implemented.");
  }
}