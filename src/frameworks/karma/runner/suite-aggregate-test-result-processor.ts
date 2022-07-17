import { EventEmitter } from 'vscode';
import { TestInfo, TestSuiteEvent, TestSuiteInfo } from 'vscode-test-adapter-api';
import { TestResultEvent } from '../../../core/base/test-events';
import { AnyTestInfo, TestType } from '../../../core/base/test-infos';
import { TestResults } from '../../../core/base/test-results';
import { TestStatus } from '../../../core/base/test-status';
import { TestSuiteState } from '../../../core/base/test-suite-state';
import { StoredTestResolver } from '../../../core/test-store';
import { TestTreeProcessor } from '../../../core/util/test-tree-processor';
import { Logger } from '../../../util/logging/logger';

export class SuiteAggregateTestResultProcessor {
  public constructor(
    private readonly testResultEventEmitter: EventEmitter<TestResultEvent>,
    private readonly testResolver: StoredTestResolver,
    private readonly testTreeProcessor: TestTreeProcessor,
    private readonly logger: Logger
  ) {}

  public processTestResults(testResults: TestResults) {
    this.logger.debug(() => `Aggregating new test results`);

    const testCountsBySuiteId: Map<string, { [key in TestStatus]?: number }> = new Map();

    const captureCountForSuiteAndStatus = (test: AnyTestInfo, testCount: number, testStatus: TestStatus) => {
      if (test.type === TestType.Suite) {
        const testCounts = testCountsBySuiteId.get(test.id) ?? {};
        testCounts[testStatus] = testCount;
        testCountsBySuiteId.set(test.id, testCounts);
      }
    };

    const totalTestCounts: { [key in TestStatus]?: number } = {};

    Object.values(TestStatus).forEach(testStatus => {
      totalTestCounts[testStatus] = this.testTreeProcessor.processTestTree(
        testResults[testStatus],
        (test: TestInfo): number => (test.type === TestType.Test ? 1 : 0),
        counts => counts.reduce((count1, count2) => count1 + count2, 0),
        (test, testCount) => captureCountForSuiteAndStatus(test, testCount, testStatus)
      );
    });

    this.logger.debug(
      () =>
        'Processed ' +
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
      const totalTestCountDescription = totalSuiteTestCount === 1 ? '1 test' : `${totalSuiteTestCount} tests`;

      const testResultDescription = !suiteExecutedAllTests
        ? `${totalTestCountDescription}`
        : failedTestCount === totalSuiteTestCount
        ? `${totalTestCountDescription}, all failed`
        : passedTestCount === totalSuiteTestCount
        ? `${totalTestCountDescription}, all passed`
        : skippedTestCount === totalSuiteTestCount
        ? `${totalTestCountDescription}, all skipped`
        : `${totalTestCountDescription}` +
          (failedTestCount > 0 ? `, ${failedTestCount} failed` : '') +
          (passedTestCount > 0 ? `, ${passedTestCount} passed` : '') +
          (skippedTestCount > 0 ? `, ${skippedTestCount} skipped` : '');

      const testEvent: TestSuiteEvent = {
        type: TestType.Suite,
        suite: testSuiteId,
        state: TestSuiteState.Completed,
        description: `(${testResultDescription})`,
        tooltip: (testSuite ? `${testSuite.tooltip}  ` : '') + testResultDescription
      };

      this.testResultEventEmitter.fire(testEvent);
    }
  }
}
