import {
	RetireEvent,
	TestEvent,
	TestInfo,
	TestLoadFinishedEvent,
	TestLoadStartedEvent,
	TestRunFinishedEvent,
	TestRunStartedEvent
} from 'vscode-test-adapter-api';
import { Disposable } from '../../../api/disposable';
import { Logger } from '../../../core/logger';
import { SpecCompleteResponse } from './spec-complete-response';
import { KarmaTestEventProcessor } from './karma-test-event-processor';
import { TestStatus } from '../../../api/test-status';
import { TestLoadEvent, TestResultEvent, TestRunEvent } from '../../../api/test-events';
import { EventEmitter } from 'vscode';
import { TestLoadProcessor } from './test-load-processor';
import { TestType } from '../../../api/test-infos';
import { TestState } from '../../../core/test-state';

export class KarmaAutoWatchTestEventProcessor {
	private skippedSpecIds?: string[];
	private disposables: Disposable[] = [];

	public constructor(
		private readonly testEventProcessor: KarmaTestEventProcessor,
		private readonly testLoadEventEmitter: EventEmitter<TestLoadEvent>,
		private readonly testRunEventEmitter: EventEmitter<TestRunEvent>,
		private readonly testResultEventEmitter: EventEmitter<TestResultEvent>,
		private readonly testRetireEventEmitter: EventEmitter<RetireEvent>,
		private readonly testLoadProcessor: TestLoadProcessor,
		private readonly logger: Logger
	) {
		this.disposables.push(logger);
	}

	public beginProcessing() {
		this.logger.debug(() => `Beginning ambient test event processing`);
		this.concludeProcessing();

		const testRunStartedEvent: TestRunStartedEvent = { type: 'started', tests: [] };
		this.testRunEventEmitter.fire(testRunStartedEvent);

		this.skippedSpecIds = [];

		this.testEventProcessor.beginProcessing([], {
			emitTestEvents: [TestStatus.Success, TestStatus.Failed],
			filterTestEvents: [TestStatus.Failed],
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

		this.emitTestLoadEvents();
		this.emitFilteredTestEvents();
	}

	private emitTestLoadEvents() {
		const processedSpecs: SpecCompleteResponse[] = this.testEventProcessor.getProcessedSpecs();
		const capturedTests = this.testLoadProcessor.processTests(processedSpecs);

		const testLoadStartedEvent: TestLoadStartedEvent = { type: `started` };
		this.testLoadEventEmitter.fire(testLoadStartedEvent);

		const testLoadFinishedEvent: TestLoadFinishedEvent = { type: `finished`, suite: capturedTests };
		this.testLoadEventEmitter.fire(testLoadFinishedEvent);
	}

	private emitFilteredTestEvents() {
		const filteredTestResultEvents: TestEvent[] = this.testEventProcessor.getFilteredEvents();

		if (filteredTestResultEvents.length === 0) {
			return;
		}
		const filteredTestIds: string[] = filteredTestResultEvents.map(event => (event.test as TestInfo).id ?? event.test);

		const testRunStartedEvent: TestRunStartedEvent = { type: `started`, tests: filteredTestIds };
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

		filteredTestResultEvents.forEach(testEvent => this.testResultEventEmitter.fire(testEvent));

		const testRunFinishedEvent: TestRunFinishedEvent = { type: `finished` };
		this.testRunEventEmitter.fire(testRunFinishedEvent);
	}

	private concludeCurrentProcessing(): void {
		this.logger.debug(() => `Concluding ambient test event processing`);
		this.testEventProcessor.concludeProcessing();

		this.logger.debug(() => `Retiring skipped ambient test ids: ${JSON.stringify(this.skippedSpecIds)}`);
		this.emitRetireEvent(this.skippedSpecIds);

		const testRunFinishedEvent: TestRunFinishedEvent = { type: 'finished' };
		this.testRunEventEmitter.fire(testRunFinishedEvent);

		this.skippedSpecIds = undefined;
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

	public dispose() {
		this.disposables.forEach(disposable => disposable.dispose());
	}
}
