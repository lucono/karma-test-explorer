import { EventEmitter } from 'vscode';
import {
  RetireEvent,
  TestEvent,
  TestInfo,
  TestLoadFinishedEvent,
  TestLoadStartedEvent,
  TestRunFinishedEvent,
  TestRunStartedEvent
} from 'vscode-test-adapter-api';
import { TestLoadEvent, TestResultEvent, TestRunEvent } from '../../../core/base/test-events';
import { TestType } from '../../../core/base/test-infos';
import { TestState } from '../../../core/base/test-state';
import { TestStatus } from '../../../core/base/test-status';
import { TestStore } from '../../../core/test-store';
import { Disposable } from '../../../util/disposable/disposable';
import { Disposer } from '../../../util/disposable/disposer';
import { Logger } from '../../../util/logging/logger';
import { KarmaTestEventProcessor, TestEventProcessingResults } from './karma-test-event-processor';
import { SpecCompleteResponse } from './spec-complete-response';
import { TestDiscoveryProcessor } from './test-discovery-processor';

export class KarmaAutoWatchTestEventProcessor {
  private skippedSpecIds?: string[];
  private disposables: Disposable[] = [];

  public constructor(
    private readonly testEventProcessor: KarmaTestEventProcessor,
    private readonly testLoadEventEmitter: EventEmitter<TestLoadEvent>,
    private readonly testRunEventEmitter: EventEmitter<TestRunEvent>,
    private readonly testResultEventEmitter: EventEmitter<TestResultEvent>,
    private readonly testRetireEventEmitter: EventEmitter<RetireEvent>,
    private readonly testDiscoveryProcessor: TestDiscoveryProcessor,
    private readonly testStore: TestStore,
    private readonly logger: Logger
  ) {
    this.disposables.push(logger);
  }

  public async beginProcessing(): Promise<void> {
    this.logger.debug(() => 'Beginning ambient test event processing');
    this.concludeProcessing();

    const testRunStartedEvent: TestRunStartedEvent = { type: 'started', tests: [] };
    this.testRunEventEmitter.fire(testRunStartedEvent);

    this.skippedSpecIds = [];

    const futureProcessingResults = this.testEventProcessor.processTestEvents([], {
      emitTestEvents: [TestStatus.Success, TestStatus.Failed],
      filterTestEvents: [TestStatus.Failed],
      emitTestStats: false
    });

    let processingResults: TestEventProcessingResults | undefined;

    try {
      processingResults = await futureProcessingResults;
    } catch (error) {
      this.logger.debug(() => `Aborting current ambient event processing - ${error ?? '<No message>'}`);
    }

    this.concludeCurrentProcessing();

    if (processingResults) {
      this.emitTestLoadEvents(processingResults.processedSpecs);
      this.emitFilteredTestEvents(processingResults.filteredEvents);
    } else {
      processingResults = { processedSpecs: [], filteredEvents: [] };
    }
  }

  public processTestErrorEvent(message: string): void {
    this.logger.debug(() => `Aborting current ambient event processing - ${message ?? '<No message>'}`);

    if (!this.testEventProcessor.isProcessing()) {
      return;
    }
    this.testEventProcessor.processTestErrorEvent(message);
  }

  public async concludeProcessing(): Promise<void> {
    if (!this.testEventProcessor.isProcessing()) {
      return;
    }
    this.testEventProcessor.concludeProcessing();
  }

  private concludeCurrentProcessing(): void {
    this.logger.debug(() => 'Concluding ambient test event processing');
    this.logger.debug(() => `Retiring ${this.skippedSpecIds?.length ?? 0} skipped ambient test ids`);
    this.logger.trace(() => `Skipped ambient test ids to retire: ${JSON.stringify(this.skippedSpecIds)}`);
    this.emitRetireEvent(this.skippedSpecIds);

    const testRunFinishedEvent: TestRunFinishedEvent = { type: 'finished' };
    this.testRunEventEmitter.fire(testRunFinishedEvent);

    this.skippedSpecIds = undefined;
    this.logger.debug(() => 'Done concluding ambient test event processing');
  }

  private emitTestLoadEvents(processedSpecs: SpecCompleteResponse[]) {
    this.logger.debug(() => 'Processing ambient test load events');

    const testLoadStartedEvent: TestLoadStartedEvent = { type: 'started' };
    this.testLoadEventEmitter.fire(testLoadStartedEvent);

    const capturedTests = this.testDiscoveryProcessor.processTests(processedSpecs);

    this.testStore.storeRootSuite(capturedTests);
    const testLoadFinishedEvent: TestLoadFinishedEvent = { type: 'finished', suite: capturedTests };
    this.testLoadEventEmitter.fire(testLoadFinishedEvent);
    this.logger.debug(() => 'Done processing ambient test load events');
  }

  private emitFilteredTestEvents(filteredTestResultEvents: TestEvent[]) {
    if (filteredTestResultEvents.length === 0) {
      return;
    }
    this.logger.debug(() => 'Processing ambient filtered test events');
    const filteredTestIds: string[] = filteredTestResultEvents.map(event => (event.test as TestInfo).id ?? event.test);

    const testRunStartedEvent: TestRunStartedEvent = { type: 'started', tests: filteredTestIds };
    this.testRunEventEmitter.fire(testRunStartedEvent);

    filteredTestResultEvents.forEach(testResultEvent => {
      const testRunningEvent: TestEvent = {
        type: TestType.Test,
        test: testResultEvent.test,
        state: TestState.Running
      };
      this.testResultEventEmitter.fire(testRunningEvent);
      this.testResultEventEmitter.fire(testResultEvent);
    });

    const testRunFinishedEvent: TestRunFinishedEvent = { type: 'finished' };
    this.testRunEventEmitter.fire(testRunFinishedEvent);
    this.logger.debug(() => 'Done processing ambient filtered test events');
  }

  private emitRetireEvent(testIds?: string[]) {
    if (!testIds?.length) {
      return;
    }

    const testRetireEvent: RetireEvent = { tests: testIds };
    this.testRetireEventEmitter.fire(testRetireEvent);
  }

  public processTestResultEvent(testResult: SpecCompleteResponse) {
    const testId = testResult.id;

    if (testResult.status === TestStatus.Skipped) {
      this.skippedSpecIds?.push(testId);
    }
    this.logger.debug(() => `Processing ambient test result event for test id: ${testId}`);
    this.testEventProcessor.processTestResultEvent(testResult);
  }

  public isProcessing(): boolean {
    return this.testEventProcessor.isProcessing();
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
