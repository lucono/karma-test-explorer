import { Logger } from "../helpers/logger";
import { KarmaEventListener, TestCapture } from "../integration/karma-event-listener";
import { TestFileSuiteInfo, TestFolderSuiteInfo, TestInfo, TestSuiteInfo } from "vscode-test-adapter-api";
import { TestRunner } from "./test-runner";
import { SpecCompleteResponse } from "../../model/spec-complete-response";
import { SpecResponseToTestSuiteInfoMapper } from "../test-explorer/spec-response-to-test-suite-info-mapper";
import { TestSuiteType, TestType } from "../../model/enums/test-type.enum";
import { TestExplorerConfiguration } from "../../model/test-explorer-configuration";
import { KarmaRunConfig, TestRunExecutor } from "./test-run-executor";
import { DeferredPromise } from "../helpers/deferred-promise";
import { Execution } from "../helpers/execution";
import { TestResult } from "../../model/enums/test-status.enum";

const SKIP_ALL_TESTS_PATTERN = "$#%#";
const RUN_ALL_TESTS_PATTERN = "";

export type TestResults = { [key in TestResult]: TestSuiteInfo };

export class KarmaTestRunner implements TestRunner {
  public constructor(
    private readonly testRunExecutor: TestRunExecutor,
    private readonly karmaEventListener: KarmaEventListener,  // FIXME: Should not receive but own its own listener
    private readonly specToTestSuiteMapper: SpecResponseToTestSuiteInfoMapper,
    private readonly logger: Logger
  ) {}

  public async loadTests(
    karmaPort: number,
    testExplorerConfig: TestExplorerConfiguration): Promise<TestSuiteInfo>
  {
    const karmaRunConfig = this.createKarmaRunConfig(SKIP_ALL_TESTS_PATTERN, karmaPort);

    const testLoadStartedDeferred: DeferredPromise<void> = new DeferredPromise();
    const testLoadEndedDeferred: DeferredPromise<void> = new DeferredPromise();

    const testLoadOperation: Execution = {
      started: testLoadStartedDeferred.promise(),
      stopped: testLoadEndedDeferred.promise()
    };
    const testCapture: Promise<TestCapture> = this.karmaEventListener.listenForTests(testLoadOperation);

    testLoadStartedDeferred.resolve();
    await this.testRunExecutor.executeTestRun(karmaRunConfig, testExplorerConfig);
    testLoadEndedDeferred.resolve();

    const capturedSpecs: TestCapture = await testCapture;
    const loadedSpecs: SpecCompleteResponse[] = capturedSpecs[TestResult.Skipped];
    const loadedTests: TestSuiteInfo = this.specToTestSuiteMapper.map(loadedSpecs);

    return loadedTests;
  }

  public async runTests(
    tests: (TestInfo | TestSuiteInfo)[],
    karmaPort: number,
    testExplorerConfig: TestExplorerConfiguration): Promise<TestResults>
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
      const derivedRunnableTests: (TestInfo | TestSuiteInfo)[] = this.toRunnableTests(tests);
      testList = this.removeTestOverlaps(derivedRunnableTests);
      this.logger.debug(() => `Resolved tests to run: ${JSON.stringify(testList.map(test => test.fullName))}`);
  
      const testPatterns: string[] = testList
        .filter(test => !!test.fullName)  // FIXME: These will be files and folders - expand to suites and add to tests
        .map(test => `^${this.escapeForRegExp(test.fullName)}${test.type === TestType.Suite ? ' ' : '$'}`);

      if (testPatterns.length === 0) {
        throw new Error(`No tests to run`);
      }
      aggregateTestPattern = `/(${testPatterns.join("|")})/`;
    }

    const karmaRunConfig = this.createKarmaRunConfig(aggregateTestPattern, karmaPort);

    const testRunStartedDeferred: DeferredPromise<void> = new DeferredPromise();
    const testRunEndedDeferred: DeferredPromise<void> = new DeferredPromise();

    const testRunOperation: Execution = {
      started: testRunStartedDeferred.promise(),
      stopped: testRunEndedDeferred.promise()
    };

    const testNames: string[] = testList.map(test => test.fullName);
    const testCapture: Promise<TestCapture> = this.karmaEventListener.listenForTests(testRunOperation, testNames);

    testRunStartedDeferred.resolve();
    await this.testRunExecutor.executeTestRun(karmaRunConfig, testExplorerConfig);
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

  private createKarmaRunConfig(testPattern: string, karmaPort: number): KarmaRunConfig {
    return {
      port: karmaPort,
      refresh: false,
      urlRoot: "/run",
      hostname: "localhost",
      clientArgs: [`--grep=${testPattern}`],
    };
  }

  private toRunnableTests(tests: (TestInfo | TestSuiteInfo | TestFileSuiteInfo | TestFolderSuiteInfo)[]): (TestInfo | TestSuiteInfo)[] {
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

  private removeTestOverlaps(tests: (TestInfo | TestSuiteInfo)[]): (TestInfo | TestSuiteInfo)[] {
    const resolvedTests = new Set(tests);

    const removeDuplicates = (test: TestInfo | TestSuiteInfo) => {
      if (resolvedTests.has(test)) {
        resolvedTests.delete(test);
      }
      if (test.type === TestType.Suite) {
        test.children.forEach(childTest => removeDuplicates(childTest));
      }
    }

    tests.forEach(test => {
      if (resolvedTests.has(test) && test.type === TestType.Suite) {
        test.children.forEach(childTest => removeDuplicates(childTest))
      };
    });

    return [ ...resolvedTests ];
  }

  private escapeForRegExp(stringValue: string) {
    // Taken from MDN: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#escaping
    return stringValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}