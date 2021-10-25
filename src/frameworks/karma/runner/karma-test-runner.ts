import RichPromise from 'bluebird';
import { TestInfo, TestSuiteInfo } from 'vscode-test-adapter-api';
import { TestRunExecutor } from '../../../api/test-run-executor';
import { TestRunner } from '../../../api/test-runner';
import { KARMA_TEST_RUN_ID_FLAG } from '../../../constants';
import { TestFramework, TestSet } from '../../../core/base/test-framework';
import { AnyTestInfo, TestSuiteType, TestType } from '../../../core/base/test-infos';
import { Disposable } from '../../../util/disposable/disposable';
import { Disposer } from '../../../util/disposable/disposer';
import { DeferredPromise } from '../../../util/future/deferred-promise';
import { Logger } from '../../../util/logging/logger';
import { generateRandomId } from '../../../util/utils';
import { KarmaTestEventListener } from './karma-test-event-listener';
import { SpecCompleteResponse } from './spec-complete-response';
import { TestDiscoveryProcessor } from './test-discovery-processor';

export class KarmaTestRunner implements TestRunner {
  private disposables: Disposable[] = [];

  public constructor(
    private readonly testRunExecutor: TestRunExecutor,
    private readonly testFramework: TestFramework,
    private readonly karmaEventListener: KarmaTestEventListener,
    private readonly testDiscoveryProcessor: TestDiscoveryProcessor,
    private readonly logger: Logger
  ) {
    this.disposables.push(karmaEventListener, logger);
  }

  public async discoverTests(karmaPort: number): Promise<TestSuiteInfo> {
    const testRunId = generateRandomId();
    const testDiscoverySelector: string = this.testFramework.getTestSelector().testDiscovery();
    const clientArgs: string[] = [`--grep=${testDiscoverySelector}`, `${KARMA_TEST_RUN_ID_FLAG}=${testRunId}`];

    const deferredTestDiscovery = new DeferredPromise<SpecCompleteResponse[]>();
    const futureTestDiscovery = deferredTestDiscovery.promise();

    const testDiscoveryProcessingExecution = this.karmaEventListener.listenForTestDiscovery(testRunId);

    this.logger.debug(() => `Executing test discovery run id: ${testRunId}`);
    const testDiscoveryExecution = this.testRunExecutor.executeTestRun(karmaPort, clientArgs);

    RichPromise.any([testDiscoveryExecution.failed(), testDiscoveryProcessingExecution.failed()]).then(failureReason =>
      deferredTestDiscovery.reject(failureReason)
    );

    testDiscoveryProcessingExecution.ended().then(discoveredSpecs => deferredTestDiscovery.fulfill(discoveredSpecs));

    const discoveredSpecs: SpecCompleteResponse[] = await futureTestDiscovery;

    this.logger.debug(() => 'Processing specs from test discovery');
    const discoveredTests: TestSuiteInfo = this.testDiscoveryProcessor.processTests(discoveredSpecs);

    return discoveredTests;
  }

  public async runTests(karmaPort: number, tests: (TestInfo | TestSuiteInfo)[]): Promise<void> {
    this.logger.debug(
      () => `Requested test run for ${tests.length} test Id(s): ${JSON.stringify(tests.map(test => test.id))}`
    );

    const runAllTests = tests.length === 0;
    let testList: (TestInfo | TestSuiteInfo)[];
    let aggregateTestPattern: string;

    if (runAllTests) {
      this.logger.debug(() => 'Received empty test list - Will run all tests');

      testList = [];
      aggregateTestPattern = this.testFramework.getTestSelector().allTests();
    } else {
      testList = this.toRunnableTests(tests);
      this.logger.debug(() => `Resolved ${testList.length} tests to run`);
      this.logger.trace(() => `Resolved tests to run: ${JSON.stringify(testList.map(test => test.fullName))}`);

      if (testList.length === 0) {
        throw new Error('No tests to run');
      }

      const testSet: TestSet = { testSuites: [], tests: [] };
      testList.forEach(test => (test.type === TestType.Suite ? testSet.testSuites : testSet.tests).push(test.fullName));

      aggregateTestPattern = this.testFramework.getTestSelector().testSet(testSet);
    }

    const testRunId = generateRandomId();
    const clientArgs = [`--grep=${aggregateTestPattern}`, `${KARMA_TEST_RUN_ID_FLAG}=${testRunId}`];
    const testNames: string[] = testList.map(test => test.fullName);

    const deferredTestRun = new DeferredPromise<void>();
    const futureTestRunCompletion = deferredTestRun.promise();

    const testRunProcessingExecution = this.karmaEventListener.listenForTestRun(testRunId, testNames);

    this.logger.debug(() => `Executing test execution run id: ${testRunId}`);
    const testRunExecution = this.testRunExecutor.executeTestRun(karmaPort, clientArgs);

    RichPromise.any([testRunExecution.failed(), testRunProcessingExecution.failed()]).then(failureReason => {
      deferredTestRun.reject(failureReason);
    });

    testRunProcessingExecution.ended().then(() => {
      deferredTestRun.fulfill();
    });

    await futureTestRunCompletion;
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

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
