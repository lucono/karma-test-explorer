import { Logger } from "../../util/logger";
import { KarmaEventListener, TestCapture } from "./integration/karma-event-listener";
import { TestInfo, TestSuiteInfo } from "vscode-test-adapter-api";
import { TestRunner } from "../../api/test-runner";
import { SpecCompleteResponse } from "./integration/spec-complete-response";
import { SpecResponseToTestSuiteInfoMapper } from "./integration/spec-response-to-test-suite-info-mapper";
import { DeferredPromise } from "../../util/deferred-promise";
import { Execution } from "../../api/execution";
import { TestResult, TestResults } from "../../api/test-result";
import { TestRunExecutor } from "../../api/test-run-executor";
import { RUN_ALL_TESTS_PATTERN, SKIP_ALL_TESTS_PATTERN } from "./karma-constants";
import { AnyTestInfo, TestSuiteType, TestType } from "../../api/test-infos";

export class KarmaTestRunner implements TestRunner {
  public constructor(
    private readonly testRunExecutor: TestRunExecutor,
    private readonly karmaEventListener: KarmaEventListener,  // FIXME: Should not receive but own its own listener
    private readonly specToTestSuiteMapper: SpecResponseToTestSuiteInfoMapper,
    private readonly logger: Logger
  ) {}

  public async loadTests(karmaPort: number): Promise<TestSuiteInfo>
  {
    const testLoadStartedDeferred: DeferredPromise<void> = new DeferredPromise();
    const testLoadEndedDeferred: DeferredPromise<void> = new DeferredPromise();

    const testLoadOperation: Execution = {
      started: () => testLoadStartedDeferred.promise(),
      stopped: () => testLoadEndedDeferred.promise()
    };
    const testCapture: Promise<TestCapture> = this.karmaEventListener.listenForTests(testLoadOperation);
    const clientArgs: string[] = [ `--grep=/${SKIP_ALL_TESTS_PATTERN}/` ];

    testLoadStartedDeferred.resolve();
    await this.testRunExecutor.executeTestRun(karmaPort, clientArgs).stopped();
    testLoadEndedDeferred.resolve();

    const capturedSpecs: TestCapture = await testCapture;

    const loadedSpecs: SpecCompleteResponse[] = [
      ...capturedSpecs[TestResult.Skipped],
      ...capturedSpecs[TestResult.Success],
      ...capturedSpecs[TestResult.Failed]
    ];

    this.logger.info(`Load tests captured ` +
      `${capturedSpecs[TestResult.Skipped].length} skipped specs, ` +
      `${capturedSpecs[TestResult.Success].length} skipped specs, ` +
      `${capturedSpecs[TestResult.Failed].length} skipped specs`);

    const loadedTests: TestSuiteInfo = this.specToTestSuiteMapper.map(loadedSpecs);

    return loadedTests;
  }

  public async runTests(karmaPort: number, tests: (TestInfo | TestSuiteInfo)[]): Promise<TestResults>
  {
    this.logger.info(
      `Requested ${tests.length} tests to run: ${JSON.stringify(tests.map(test => test.fullName))}`,
      { divider: "Karma Logs" });  // FIXME: what's divider?

    const runAllTests = tests.length === 0;
    let testList: (TestInfo | TestSuiteInfo)[];
    let aggregateTestPattern: string = SKIP_ALL_TESTS_PATTERN;

    if (runAllTests) {
      this.logger.debug(() => `Received empty test list - Will run all tests`);

      testList = [];
      aggregateTestPattern = RUN_ALL_TESTS_PATTERN;

    } else {
      testList = this.toRunnableTests(tests);
      this.logger.debug(() => `Resolved tests to run: ${JSON.stringify(testList.map(test => test.fullName))}`);
  
      const testPatterns: string[] = testList
        .filter(test => !!test.fullName)  // FIXME: These will be files and folders - expand to suites and add to tests
        .map(test => `^${this.escapeForRegExp(test.fullName)}${test.type === TestType.Suite ? ' ' : '$'}`);

      if (testPatterns.length === 0) {
        throw new Error(`No tests to run`);
      }
      aggregateTestPattern = `/(${testPatterns.join("|")})/`;
    }

    const clientArgs = [`--grep=${aggregateTestPattern}`];
    const testRunStartedDeferred: DeferredPromise<void> = new DeferredPromise();
    const testRunEndedDeferred: DeferredPromise<void> = new DeferredPromise();

    const testRunOperation: Execution = {
      started: () => testRunStartedDeferred.promise(),
      stopped: () => testRunEndedDeferred.promise()
    };

    const testNames: string[] = testList.map(test => test.fullName);
    const testCapture: Promise<TestCapture> = this.karmaEventListener.listenForTests(testRunOperation, testNames);

    testRunStartedDeferred.resolve();
    await this.testRunExecutor.executeTestRun(karmaPort, clientArgs).stopped();
    testRunEndedDeferred.resolve();
    
    const capturedSpecs: TestCapture = await testCapture;
    const failedTests: TestSuiteInfo = this.specToTestSuiteMapper.map(capturedSpecs[TestResult.Failed]);
    const passedTests: TestSuiteInfo = this.specToTestSuiteMapper.map(capturedSpecs[TestResult.Success]);
    const skippedTests: TestSuiteInfo = this.specToTestSuiteMapper.map(capturedSpecs[TestResult.Skipped]);

    const testResults: TestResults = {
      [TestResult.Failed]: failedTests,
      [TestResult.Success]: passedTests,
      [TestResult.Skipped]: skippedTests
    };

    return testResults;
  }

  private toRunnableTests(tests: AnyTestInfo[]): (TestInfo | TestSuiteInfo)[] {
    const runnableTests: (TestInfo | TestSuiteInfo)[] = [];

    tests.forEach(test => {
      if (test.fullName) {
        runnableTests.push(test);
        return;
      }
      if (test.type !== TestType.Suite || !('suiteType' in test)) {
        return;
      }
      if (test.suiteType === TestSuiteType.File) {
        runnableTests.push(...test.children);
        return;
      }
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
}