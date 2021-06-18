import { EventEmitter } from "vscode";
import { TestLoadFinishedEvent, TestLoadStartedEvent } from "vscode-test-adapter-api";
import { Disposable } from "../../../api/disposable";
import { TestLoadEvent } from "../../../api/test-events";
import { Logger } from "../../../core/logger";
import { SpecCompleteResponse } from "./spec-complete-response";
import { KarmaTestEventProcessor } from "./karma-test-event-processor";

export class KarmaAmbientTestEventProcessor {  // FIXME: Not currently used

  private disposables: Disposable[] = [];

  public constructor(
    private readonly testEventProcessor: KarmaTestEventProcessor,
    private readonly testLoadEventEmitter: EventEmitter<TestLoadEvent>,
    private readonly logger: Logger)
  {
    this.disposables.push(logger, testLoadEventEmitter);
  }

  public beginProcessing() {
    this.logger.debug(() => `Beginning test load event processing`);

    this.testEventProcessor.concludeProcessing();

    const testLoadStartedEvent: TestLoadStartedEvent = { type: `started` };
    this.testLoadEventEmitter.fire(testLoadStartedEvent);

    this.testEventProcessor.beginProcessing([], { emitEvents: false });
  }

  public concludeProcessing(): void {
    this.logger.debug(() => `Concluding test load event processing`);

    this.testEventProcessor.concludeProcessing();
    const testLoadFinishedEvent: TestLoadFinishedEvent = { type: `finished` };
    this.testLoadEventEmitter.fire(testLoadFinishedEvent);
  }

  public getProcessedEvents(): SpecCompleteResponse[] {
    this.concludeProcessing();
    return this.testEventProcessor.getProcessedEvents();
  }

  public processTestResultEvent(testId: string, testResult: SpecCompleteResponse) {
    this.testEventProcessor.processTestResultEvent(testId, testResult);
  }

  public isProcessing(): boolean {
    return this.testEventProcessor.isProcessing();
  }

  public dispose() {
    this.disposables.forEach(disposable => disposable.dispose());
  }
}
