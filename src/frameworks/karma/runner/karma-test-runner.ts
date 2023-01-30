import { TestInfo, TestSuiteInfo } from 'vscode-test-adapter-api';

import RichPromise from 'bluebird';

import { TestRunExecutor } from '../../../api/test-run-executor.js';
import { TestRunner } from '../../../api/test-runner.js';
import { KARMA_TEST_RUN_ID_FLAG } from '../../../constants.js';
import { TestFramework, TestSet } from '../../../core/base/test-framework.js';
import { AnyTestInfo, TestType } from '../../../core/base/test-infos.js';
import { Disposable } from '../../../util/disposable/disposable.js';
import { Disposer } from '../../../util/disposable/disposer.js';
import { DeferredPromise } from '../../../util/future/deferred-promise.js';
import { Logger } from '../../../util/logging/logger.js';
import { generateRandomId } from '../../../util/utils.js';
import { KarmaTestListener } from './karma-test-listener.js';
import { SpecCompleteResponse } from './spec-complete-response.js';
import { TestDiscoveryProcessor } from './test-discovery-processor.js';

export class KarmaTestRunner implements TestRunner {
  private disposables: Disposable[] = [];

  public constructor(
    private readonly testRunExecutor: TestRunExecutor,
    private readonly testFramework: TestFramework,
    private readonly karmaEventListener: KarmaTestListener,
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
      const tests = test.fullName ? [test] : test.type === TestType.Suite ? this.toRunnableTests(test.children) : [];
      runnableTests.push(...tests);

      if (test.type === TestType.Test && !test.fullName) {
        this.logger.warn(() => `Encountered anomalous test lacking full name`);
        this.logger.trace(() => `Anomalous test lacking full name: ${JSON.stringify(test, null, 2)}`);
      }
    });
    return runnableTests;
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
