import { TestInfo, TestSuiteInfo } from "vscode-test-adapter-api";
import { Disposable } from "../api/disposable";
import { TestGrouping } from "../api/test-grouping";
import { TestManager } from "../api/test-manager";
import { TestStatus, TestResults } from "../api/test-status";
import { Logger } from "../util/logger";
import { SuiteAggregateTestResultEmitter } from "./suite-aggregate-test-result-emitter";
// import { TestCountProcessor } from "../util/test-count-processor";
import { TestSuiteMerger } from "../util/test-suite-merger";
import { TestSuiteOrganizer } from "./test-suite-organizer";
import { TestSuiteTreeProcessor } from "../util/test-suite-tree-processor";
import { AnyTestInfo, TestType } from "../api/test-infos";

export class AggregatingTestManager implements TestManager {

  private readonly disposables: Disposable[] = [];

  public constructor(
    private readonly testManagers: TestManager[],
    private readonly testSuiteOrganizer: TestSuiteOrganizer,
    private readonly testSuiteTreeProcessor: TestSuiteTreeProcessor,
    private readonly suiteTestResultEmitter: SuiteAggregateTestResultEmitter,
    private readonly testSuiteMerger: TestSuiteMerger,
    private readonly testGrouping: TestGrouping,
    private readonly projectRootPath: string,
    private readonly logger: Logger)
  {}
  
  public async restart(): Promise<void> {
    this.logger.info(`Restarting aggregate server`);

    await Promise.all(this.testManagers.map(manager => manager.restart())).catch(rejectReason => {
      throw new Error(`Failed while attempting to restart aggregate server: ${rejectReason}`);
    });
    this.logger.info(`Done restarting aggregate server`);
  }

  public async loadTests(): Promise<TestSuiteInfo> {
    this.logger.info(`Starting aggregate server test load`);

    const loadedTests: TestSuiteInfo[] = await Promise.all(
      this.testManagers.map(manager => manager.loadTests())
    );

    let testSuiteInfo: TestSuiteInfo = this.testSuiteMerger.merge(loadedTests)!;

    if (!testSuiteInfo) {
      throw new Error(`Failed to load any tests`);
    }

    if (this.testGrouping === TestGrouping.Folder) {
      testSuiteInfo = this.testSuiteOrganizer.groupByFolder(testSuiteInfo, this.projectRootPath);
    }

    const addTestCount = (test: AnyTestInfo, testCount: number) => {
      if (test.type === TestType.Suite) {
        test.testCount = testCount;
        test.description = testCount === 1 ? `(1 test)` : `(${testCount} tests)`;
      }
    };

    const totalTestCount = this.testSuiteTreeProcessor.processTestSuite<number>(
      testSuiteInfo, 1, 0, addTestCount,
      (runningTestCount, nextSuiteTestCount) => runningTestCount + nextSuiteTestCount
    );

    // const totalTestCount = this.testCountProcessor.addTestCounts(testSuiteInfo, (testSuite, testCount) => {
    //   testSuite.testCount = testCount;
    //   testSuite.description = testCount === 1 ? `(1 test)` : `(${testCount} tests)`;
    // });

    this.logger.info(totalTestCount > 0
      ? `Test loading - ${totalTestCount} total tests loaded from Karma`
      : `Test loading - No tests found`);

    this.logger.info(`Aggregate server test load done`);

    return testSuiteInfo;
  }

  public async runTests(tests: (TestInfo | TestSuiteInfo)[]): Promise<TestResults> {
    this.logger.info(`Starting aggregate server test run`);

    const testResultsList: TestResults[] = await Promise.all(
      this.testManagers.map(manager => manager.runTests(tests))
    );

    // this.handleTestSuiteResults(testResults, config.testGrouping, config.projectRootPath);

    if (this.testGrouping === TestGrouping.Folder) {
      Object.values(TestStatus).forEach(testStatus => {
        testResultsList.forEach(testResults => {
          testResults[testStatus] = this.testSuiteOrganizer.groupByFolder(testResults[testStatus], this.projectRootPath, false);
        });
      });
    }

    const combinedTestResults = {} as TestResults;

    Object.values(TestStatus).forEach(testStatus => {
      combinedTestResults[testStatus] = this.testSuiteMerger.merge(testResultsList.map(testResults => testResults[testStatus]))!;
    });

    this.suiteTestResultEmitter.processTestResults(combinedTestResults);
    this.logger.info(`Aggregate server test run done`);

    return combinedTestResults;
  }

  public async stopCurrentRun(): Promise<void> {
    await Promise.all(this.testManagers.map(manager => manager.stopCurrentRun()));
  }

  public isTestRunning(): boolean {
    return this.testManagers.some(manager => manager.isTestRunning());
  }

  public dispose() {
    this.disposables.forEach(disposable => disposable.dispose());
  }
}
