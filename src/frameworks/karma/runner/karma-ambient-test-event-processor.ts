import { Disposable } from "../../../api/disposable";
import { Logger } from "../../../core/logger";
import { SpecCompleteResponse } from "./spec-complete-response";
import { KarmaTestEventProcessor } from "./karma-test-event-processor";
import { TestStatus } from "../../../api/test-status";
import { TestRunEvent } from "../../../api/test-events";
import { EventEmitter } from "vscode";
import { TestRunFinishedEvent, TestRunStartedEvent } from "vscode-test-adapter-api";

export class KarmaAmbientTestEventProcessor {  // FIXME: Not currently used

  private disposables: Disposable[] = [];

  public constructor(
    private readonly testEventProcessor: KarmaTestEventProcessor,
    private readonly testRunEventEmitter: EventEmitter<TestRunEvent>,
    private readonly logger: Logger)
  {
    this.disposables.push(logger);
  }

  public beginProcessing() {
    this.logger.debug(() => `Beginning ambient test event processing`);

    const testRunStartedEvent: TestRunStartedEvent = { type: "started", tests: [] };
    this.testRunEventEmitter.fire(testRunStartedEvent);

    this.testEventProcessor.beginProcessing([], { emitEvents: true });
  }

  public concludeProcessing(): void {
    this.logger.debug(() => `Concluding test load event processing`);
    this.testEventProcessor.concludeProcessing();
    
    const testRunFinishedEvent: TestRunFinishedEvent = { type: "finished" };
    this.testRunEventEmitter.fire(testRunFinishedEvent);

    // FIXME: Retrieve and process captured test events
  }

  // public getProcessedEvents(): SpecCompleteResponse[] {
  //   this.concludeProcessing();
  //   return this.testEventProcessor.getProcessedEvents();
  // }

  public processTestResultEvent(testId: string, testResult: SpecCompleteResponse) {
    if (testResult.status !== TestStatus.Skipped) {
      this.testEventProcessor.processTestResultEvent(testId, testResult);
    }
  }

  public isProcessing(): boolean {
    return this.testEventProcessor.isProcessing();
  }

  public dispose() {
    this.disposables.forEach(disposable => disposable.dispose());
  }
}
