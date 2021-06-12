import { Logger } from "../../../core/logger";
import { KarmaEventListener, TestCapture } from "./karma-event-listener";
import { TestInfo, TestSuiteInfo } from "vscode-test-adapter-api";
import { TestRunner } from "../../../api/test-runner";
import { SpecCompleteResponse } from "./spec-complete-response";
import { SpecResponseToTestSuiteInfoMapper } from "./spec-response-to-test-suite-info-mapper";
import { DeferredPromise } from "../../../util/deferred-promise";
import { Execution } from "../../../api/execution";
import { TestStatus } from "../../../api/test-status";
import { TestRunExecutor } from "../../../api/test-run-executor";
import { SKIP_ALL_TESTS_PATTERN } from "../karma-constants";
import { AnyTestInfo, TestSuiteType, TestType } from "../../../api/test-infos";
import { TestResults } from "../../../api/test-results";

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
      ended: () => testLoadEndedDeferred.promise()
    };
    const testCapture: Promise<TestCapture> = this.karmaEventListener.listenForTests(testLoadOperation);
    const clientArgs: string[] = [ `--grep=/${SKIP_ALL_TESTS_PATTERN}/` ];

    testLoadStartedDeferred.resolve();
    await this.testRunExecutor.executeTestRun(karmaPort, clientArgs).ended();
    testLoadEndedDeferred.resolve();

    const capturedSpecs: TestCapture = await testCapture;

    const loadedSpecs: SpecCompleteResponse[] = [
      ...capturedSpecs[TestStatus.Skipped],
      ...capturedSpecs[TestStatus.Success],
      ...capturedSpecs[TestStatus.Failed]
    ];

    this.logger.info(`Load tests captured ` +
      `${capturedSpecs[TestStatus.Skipped].length} skipped specs, ` +
      `${capturedSpecs[TestStatus.Success].length} passed specs, ` +
      `${capturedSpecs[TestStatus.Failed].length} failed specs`);

    const loadedTests: TestSuiteInfo = this.specToTestSuiteMapper.map(loadedSpecs);

    return loadedTests;
  }

  public async runTests(
    karmaPort: number,
    tests: (TestInfo | TestSuiteInfo)[]): Promise<TestResults>
  {
    this.logger.info(
      `Requested ${tests.length} tests to run having Ids: ${JSON.stringify(tests.map(test => test.id))}`,
      { divider: "Karma Logs" });  // FIXME: what's divider?

    const runAllTests = tests.length === 0;
    const clientArgs: string[] = [];
    let testList: (TestInfo | TestSuiteInfo)[];
    // let aggregateTestPattern: string = SKIP_ALL_TESTS_PATTERN;

    if (runAllTests) {
      this.logger.debug(() => `Received empty test list - Will run all tests`);

      testList = [];
      // aggregateTestPattern = RUN_ALL_TESTS_PATTERN;

    } else {
      testList = this.toRunnableTests(tests);
      this.logger.debug(() => `Resolved tests to run: ${JSON.stringify(testList.map(test => test.fullName))}`);
  
      const testPatterns: string[] = testList
        .filter(test => !!test.fullName)
        .map(test => `^${this.escapeForRegExp(test.fullName)}${test.type === TestType.Suite ? ' ' : '$'}`);

      if (testPatterns.length === 0) {
        throw new Error(`No tests to run`);
      }
      const aggregateTestPattern = `/(${testPatterns.join("|")})/`;
      clientArgs.push(`--grep=${aggregateTestPattern}`);
    }

    const testRunStartedDeferred: DeferredPromise<void> = new DeferredPromise();
    const testRunEndedDeferred: DeferredPromise<void> = new DeferredPromise();

    const testRunOperation: Execution = {
      started: () => testRunStartedDeferred.promise(),
      ended: () => testRunEndedDeferred.promise()
    };

    const testNames: string[] = testList.map(test => test.fullName);
    const testCapture: Promise<TestCapture> = this.karmaEventListener.listenForTests(testRunOperation, testNames);

    testRunStartedDeferred.resolve();
    await this.testRunExecutor.executeTestRun(karmaPort, clientArgs).ended();
    testRunEndedDeferred.resolve();
    
    const capturedSpecs: TestCapture = await testCapture;
    const failedTests: TestSuiteInfo = this.specToTestSuiteMapper.map(capturedSpecs[TestStatus.Failed]);
    const passedTests: TestSuiteInfo = this.specToTestSuiteMapper.map(capturedSpecs[TestStatus.Success]);
    const skippedTests: TestSuiteInfo = this.specToTestSuiteMapper.map(capturedSpecs[TestStatus.Skipped]);

    const testResults: TestResults = {
      [TestStatus.Failed]: failedTests,
      [TestStatus.Success]: passedTests,
      [TestStatus.Skipped]: skippedTests
    };

    return testResults;
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
    // FIXME: Pending impl
  }
}