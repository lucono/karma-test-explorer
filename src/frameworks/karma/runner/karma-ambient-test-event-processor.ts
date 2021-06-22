import { Disposable } from "../../../api/disposable";
import { Logger } from "../../../core/logger";
import { SpecCompleteResponse } from "./spec-complete-response";
import { KarmaTestEventProcessor } from "./karma-test-event-processor";
import { TestStatus } from "../../../api/test-status";
import { TestRunEvent } from "../../../api/test-events";
import { EventEmitter } from "vscode";
import { RetireEvent, TestRunFinishedEvent, TestRunStartedEvent } from "vscode-test-adapter-api";

export class KarmaWatchModeTestEventProcessor {  // FIXME: Not currently used

  private skippedSpecIds?: string[];
  private disposables: Disposable[] = [];

  public constructor(
    private readonly testEventProcessor: KarmaTestEventProcessor,
    private readonly testRunEventEmitter: EventEmitter<TestRunEvent>,
    private readonly testRetireEventEmitter: EventEmitter<RetireEvent>,
    private readonly logger: Logger)
  {
    this.disposables.push(logger);
  }

  public beginProcessing() {
    this.logger.debug(() => `Beginning ambient test event processing`);
    this.concludeProcessing();

    const testRunStartedEvent: TestRunStartedEvent = { type: "started", tests: [] };
    this.testRunEventEmitter.fire(testRunStartedEvent);

    this.skippedSpecIds = [];
    this.testEventProcessor.beginProcessing([], { emitEvents: true });
  }

  public concludeProcessing(): void {
    if (!this.testEventProcessor.isProcessing()) {
      return;
    }
    this.logger.debug(() => `Concluding ambient test event processing`);
    this.testEventProcessor.concludeProcessing();

    this.logger.debug(() => `Retiring skipped ambient test ids: ${JSON.stringify(this.skippedSpecIds)}`);
    this.emitRetireEvent(this.skippedSpecIds);
    
    const testRunFinishedEvent: TestRunFinishedEvent = { type: "finished" };
    this.testRunEventEmitter.fire(testRunFinishedEvent);

    this.skippedSpecIds = undefined;

    // FIXME: Retrieve and process captured test events
  }

  private emitRetireEvent(testIds?: string[]) {
    if (!testIds?.length) {
      return;
    }
    
    const testRetireEvent: RetireEvent = { tests: testIds };
    this.testRetireEventEmitter.fire(testRetireEvent);
  }

  // public getProcessedEvents(): SpecCompleteResponse[] {
  //   this.concludeProcessing();
  //   return this.testEventProcessor.getProcessedEvents();
  // }

  public processTestResultEvent(testId: string, testResult: SpecCompleteResponse) {
    if (testResult.status === TestStatus.Skipped) {
      this.skippedSpecIds?.push(testId);
      return;
    }
    this.logger.debug(() => `Processing ambient test result event for test id: ${testId}`);
    this.testEventProcessor.processTestResultEvent(testId, testResult);
  }

  public isProcessing(): boolean {
    return this.testEventProcessor.isProcessing();
  }

  public dispose() {
    this.disposables.forEach(disposable => disposable.dispose());
  }
}
