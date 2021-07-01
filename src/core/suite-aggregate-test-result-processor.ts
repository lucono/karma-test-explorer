import { EventEmitter } from 'vscode';
import { TestSuiteEvent, TestSuiteInfo } from 'vscode-test-adapter-api';
import { TestResultEvent } from '../api/test-events';
import { AnyTestInfo, TestType } from '../api/test-infos';
import { TestResults } from '../api/test-results';
import { TestStatus } from '../api/test-status';
import { TestSuiteTreeProcessor } from '../util/test-suite-tree-processor';
import { Logger } from './logger';
import { TestResolver } from './test-resolver';
import { TestSuiteState } from './test-suite-state';

export class SuiteAggregateTestResultProcessor {
	public constructor(
		private readonly testResultEventEmitter: EventEmitter<TestResultEvent>,
		private readonly testResolver: TestResolver,
		private readonly testSuiteTreeProcessor: TestSuiteTreeProcessor,
		private readonly logger: Logger
	) {}

	public processTestResults(testResults: TestResults) {
		const testCountsBySuiteId: Map<string, { [key in TestStatus]?: number }> = new Map();

		const testCountProcessor = (test: AnyTestInfo, testCount: number, testStatus: TestStatus) => {
			if (test.type === TestType.Suite) {
				const testCounts = testCountsBySuiteId.get(test.id) ?? {};
				testCounts[testStatus] = testCount;
				testCountsBySuiteId.set(test.id, testCounts);
			}
		};

		const totalTestCounts: { [key in TestStatus]?: number } = {};

		Object.values(TestStatus).forEach(testStatus => {
			totalTestCounts[testStatus] = this.testSuiteTreeProcessor.processTestSuite<number>(
				testResults[testStatus],
				1,
				0,
				(test, testCount) => testCountProcessor(test, testCount, testStatus),
				(runningTestCount, nextSuiteTestCount) => runningTestCount + nextSuiteTestCount
			);
		});

		this.logger.info(
			`Processed ` +
				`${totalTestCounts[TestStatus.Failed] ?? 0} total failed tests, ` +
				`${totalTestCounts[TestStatus.Success] ?? 0} total passed tests, ` +
				`${totalTestCounts[TestStatus.Skipped] ?? 0} total skipped tests`
		);

		for (const testSuiteId of testCountsBySuiteId.keys()) {
			const testSuite: TestSuiteInfo | undefined = this.testResolver.resolveTestSuite(testSuiteId);

			if (!testSuite) {
				this.logger.debug(() => `Lookup found no test suite with id: ${testSuiteId}`);
				continue;
			}
			const testCounts: { [key in TestStatus]?: number } = testCountsBySuiteId.get(testSuiteId)!;
			const failedTestCount = testCounts[TestStatus.Failed] ?? 0;
			const passedTestCount = testCounts[TestStatus.Success] ?? 0;
			const skippedTestCount = testCounts[TestStatus.Skipped] ?? 0;

			const totalSuiteTestCount = testSuite.testCount;
			const executedSuiteTestCount = failedTestCount + passedTestCount + skippedTestCount;
			const suiteExecutedAllTests = executedSuiteTestCount === totalSuiteTestCount;
			const totalTestCountDescription = totalSuiteTestCount === 1 ? `1 test` : `${totalSuiteTestCount} tests`;

			const testResultDescription = !suiteExecutedAllTests
				? `${totalTestCountDescription}`
				: failedTestCount === totalSuiteTestCount
				? `${totalTestCountDescription}, all failed`
				: passedTestCount === totalSuiteTestCount
				? `${totalTestCountDescription}, all passed`
				: skippedTestCount === totalSuiteTestCount
				? `${totalTestCountDescription}, all skipped`
				: `${totalTestCountDescription}` +
				  (failedTestCount > 0 ? `, ${failedTestCount} failed` : ``) +
				  (passedTestCount > 0 ? `, ${passedTestCount} passed` : ``) +
				  (skippedTestCount > 0 ? `, ${skippedTestCount} skipped` : ``);

			const testEvent: TestSuiteEvent = {
				type: TestType.Suite,
				suite: testSuiteId,
				state: TestSuiteState.Completed,
				description: `(${testResultDescription})`,
				tooltip: `${testSuite?.tooltip}  (${testResultDescription})`
			};

			this.testResultEventEmitter.fire(testEvent);
		}
	}
}
