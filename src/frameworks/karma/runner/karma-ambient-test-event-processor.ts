import { EventEmitter } from "vscode";
import { TestLoadFinishedEvent, TestLoadStartedEvent } from "vscode-test-adapter-api";
import { Disposable } from "../../../api/disposable";
import { TestLoadEvent } from "../../../api/test-events";
import { Logger } from "../../../core/logger";
import { SpecCompleteResponse } from "./spec-complete-response";
import { KarmaTestRunEventProcessor } from "./karma-test-run-event-processor";

export class KarmaAmbientTestEventProcessor {  // FIXME: Not currently used

  private disposables: Disposable[] = [];

  public constructor(
    private readonly testRunEventProcessor: KarmaTestRunEventProcessor,
    private readonly testLoadEventEmitter: EventEmitter<TestLoadEvent>,
    private readonly logger: Logger)
  {
    this.disposables.push(logger, testLoadEventEmitter);
  }

  public beginProcessing() {
    this.logger.debug(() => `Beginning test load event processing`);

    this.testRunEventProcessor.concludeProcessing();

    const testLoadStartedEvent: TestLoadStartedEvent = { type: `started` };
    this.testLoadEventEmitter.fire(testLoadStartedEvent);

    this.testRunEventProcessor.beginProcessing([], { emitEvents: false });
  }

  public concludeProcessing(): void {
    this.logger.debug(() => `Concluding test load event processing`);

    this.testRunEventProcessor.concludeProcessing();
    const testLoadFinishedEvent: TestLoadFinishedEvent = { type: `finished` };
    this.testLoadEventEmitter.fire(testLoadFinishedEvent);
  }

  public getProcessedEvents(): SpecCompleteResponse[] {
    this.concludeProcessing();
    return this.testRunEventProcessor.getProcessedEvents();
  }

  public processTestResultEvent(testId: string, testResult: SpecCompleteResponse) {
    this.testRunEventProcessor.processTestResultEvent(testId, testResult);
  }

  public isProcessing(): boolean {
    return this.testRunEventProcessor.isProcessing();
  }

  public dispose() {
    this.disposables.forEach(disposable => disposable.dispose());
  }
}
