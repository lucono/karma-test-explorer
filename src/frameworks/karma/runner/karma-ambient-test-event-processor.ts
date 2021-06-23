import { Disposable } from "../../../api/disposable";
import { Logger } from "../../../core/logger";
import { SpecCompleteResponse } from "./spec-complete-response";
import { KarmaTestEventProcessor } from "./karma-test-event-processor";
import { TestStatus } from "../../../api/test-status";
import { TestLoadEvent, TestRunEvent } from "../../../api/test-events";
import { EventEmitter } from "vscode";
import { RetireEvent, TestLoadFinishedEvent, TestLoadStartedEvent, TestRunFinishedEvent, TestRunStartedEvent } from "vscode-test-adapter-api";
import { TestLoadProcessor } from "./test-load-processor";
// import { SpecResponseToTestSuiteInfoMapper } from "./spec-response-to-test-suite-info-mapper";

export class KarmaWatchModeTestEventProcessor {  // FIXME: Not currently used

  private skippedSpecIds?: string[];
  private disposables: Disposable[] = [];

  public constructor(
    private readonly testEventProcessor: KarmaTestEventProcessor,
    private readonly testLoadEventEmitter: EventEmitter<TestLoadEvent>,
    private readonly testRunEventEmitter: EventEmitter<TestRunEvent>,
    private readonly testRetireEventEmitter: EventEmitter<RetireEvent>,
    // private readonly specToTestSuiteMapper: SpecResponseToTestSuiteInfoMapper,
    private readonly testLoadProcessor: TestLoadProcessor,
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
    this.testEventProcessor.beginProcessing([], {
      emitTestEvents: [TestStatus.Success, TestStatus.Failed],
      emitTestStats: false
    });
  }

  public abortProcessing(): void {
    if (!this.testEventProcessor.isProcessing()) {
      return;
    }
    this.concludeCurrentProcessing();
  }

  public concludeProcessing(): void {
    if (!this.testEventProcessor.isProcessing()) {
      return;
    }
    this.concludeCurrentProcessing();

    const processedSpecs = this.testEventProcessor.getProcessedEvents();

    // ------------------
    // FIXME: Duplicate processing - Test load processor does
    // testInfo mapping  which is already done internally by
    // the delegate karma test event processor in this class
    const capturedTests = this.testLoadProcessor.processTests(processedSpecs);

    // const capturedTests: TestSuiteInfo = this.specToTestSuiteMapper.map(ProcessedSpecs);

    // this.logger.debug(() =>
    //   `Loading ${capturedTests.children.length} suites ` +
    //   `from concluded watch mode test processing`);

    const testLoadStartedEvent: TestLoadStartedEvent = { type: `started` };
    this.testLoadEventEmitter.fire(testLoadStartedEvent);
    
    const testLoadFinishedEvent: TestLoadFinishedEvent = { type: `finished`, suite: capturedTests };
    this.testLoadEventEmitter.fire(testLoadFinishedEvent);
  }

  private concludeCurrentProcessing(): void {
    // if (!this.testEventProcessor.isProcessing()) {
    //   return;
    // }
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

  public processTestResultEvent(testResult: SpecCompleteResponse) {
    const testId = testResult.id;

    if (testResult.status === TestStatus.Skipped) {
      this.skippedSpecIds?.push(testId);
      // return;
    }
    this.logger.debug(() => `Processing ambient test result event for test id: ${testId}`);
    this.testEventProcessor.processTestResultEvent(testResult);
  }

  public isProcessing(): boolean {
    return this.testEventProcessor.isProcessing();
  }

  public dispose() {
    this.disposables.forEach(disposable => disposable.dispose());
  }
}
