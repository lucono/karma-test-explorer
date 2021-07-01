import { Logger } from '../../../core/logger';
import { KarmaTestEventListener } from './karma-test-event-listener';
import { TestInfo, TestSuiteInfo } from 'vscode-test-adapter-api';
import { TestRunner } from '../../../api/test-runner';
import { SpecCompleteResponse } from './spec-complete-response';
import { DeferredPromise } from '../../../util/deferred-promise';
import { Execution } from '../../../api/execution';
import { TestRunExecutor } from '../../../api/test-run-executor';
import { SKIP_ALL_TESTS_PATTERN } from '../karma-constants';
import { AnyTestInfo, TestSuiteType, TestType } from '../../../api/test-infos';
import { TestLoadProcessor } from './test-load-processor';
import { Disposable } from '../../../api/disposable';

export class KarmaTestRunner implements TestRunner {
	private disposables: Disposable[] = [];

	public constructor(
		private readonly testRunExecutor: TestRunExecutor,
		private readonly karmaEventListener: KarmaTestEventListener,
		private readonly testLoadProcessor: TestLoadProcessor,
		private readonly logger: Logger
	) {
		this.disposables.push(karmaEventListener, logger);
	}

	public async loadTests(karmaPort: number): Promise<TestSuiteInfo> {
		const testLoadStartedDeferred: DeferredPromise<void> = new DeferredPromise();
		const testLoadEndedDeferred: DeferredPromise<void> = new DeferredPromise();

		const testLoadOperation: Execution = {
			started: () => testLoadStartedDeferred.promise(),
			ended: () => testLoadEndedDeferred.promise()
		};

		const testCapture: Promise<SpecCompleteResponse[]> = this.karmaEventListener.listenForTestLoad(testLoadOperation);

		const clientArgs: string[] = [`--grep=/${SKIP_ALL_TESTS_PATTERN}/`];

		testLoadStartedDeferred.resolve();
		await this.testRunExecutor.executeTestRun(karmaPort, clientArgs).ended();
		testLoadEndedDeferred.resolve();

		const loadedSpecs: SpecCompleteResponse[] = await testCapture;
		const loadedTests: TestSuiteInfo = this.testLoadProcessor.processTests(loadedSpecs);

		return loadedTests;
	}

	public async runTests(karmaPort: number, tests: (TestInfo | TestSuiteInfo)[]): Promise<void> {
		this.logger.info(
			`Requested ${tests.length} tests to run having Ids: ${JSON.stringify(tests.map(test => test.id))}`
		);

		const runAllTests = tests.length === 0;
		const clientArgs: string[] = [];
		let testList: (TestInfo | TestSuiteInfo)[];

		if (runAllTests) {
			this.logger.debug(() => `Received empty test list - Will run all tests`);

			testList = [];
		} else {
			testList = this.toRunnableTests(tests);
			this.logger.debug(() => `Resolved tests to run: ${JSON.stringify(testList.map(test => test.fullName))}`);

			const testPatterns: string[] = testList.map(
				test => `^${this.escapeForRegExp(test.fullName)}${test.type === TestType.Suite ? ' ' : '$'}`
			);

			if (testPatterns.length === 0) {
				throw new Error(`No tests to run`);
			}
			const aggregateTestPattern = `/(${testPatterns.join('|')})/`;
			clientArgs.push(`--grep=${aggregateTestPattern}`);
		}

		const testRunStartedDeferred: DeferredPromise<void> = new DeferredPromise();
		const testRunEndedDeferred: DeferredPromise<void> = new DeferredPromise();

		const testRunOperation: Execution = {
			started: () => testRunStartedDeferred.promise(),
			ended: () => testRunEndedDeferred.promise()
		};

		const testNames: string[] = testList.map(test => test.fullName);

		this.karmaEventListener.listenForTestRun(testRunOperation, testNames);

		testRunStartedDeferred.resolve();
		await this.testRunExecutor.executeTestRun(karmaPort, clientArgs).ended();
		testRunEndedDeferred.resolve();
	}

	private toRunnableTests(tests: AnyTestInfo[]): (TestInfo | TestSuiteInfo)[] {
		const runnableTests: (TestInfo | TestSuiteInfo)[] = [];

		tests.forEach(test => {
			// Add all the runnable tests and test suites
			if (test.fullName) {
				runnableTests.push(test);
				return;
			}
			// Skip anomalous tests and test suites that lack full name (which shouldn't happen)
			if (!(test.type === TestType.Suite && 'suiteType' in test)) {
				return;
			}
			// For remaining test files, extract underlying test suites
			if (test.suiteType === TestSuiteType.File) {
				runnableTests.push(...test.children);
				return;
			}
			// For remaining test folders, extract underlying test suites
			if (test.suiteType === TestSuiteType.Folder) {
				runnableTests.push(...this.toRunnableTests(test.children));
				return;
			}
		});
		return runnableTests;
	}

	private escapeForRegExp(stringValue: string) {
		// Taken from MDN: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#escaping
		return stringValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	public dispose(): void {
		this.disposables.forEach(disposable => disposable.dispose());
	}
}
