import { TestSuiteInfo } from "vscode-test-adapter-api";
import { TestGrouping } from "../../../api/test-grouping";
import { AnyTestInfo, TestType } from "../../../api/test-infos";
import { Logger } from "../../../core/logger";
import { TestSuiteOrganizer } from "../../../core/test-suite-organizer";
import { TestSuiteTreeProcessor } from "../../../util/test-suite-tree-processor";
import { SpecCompleteResponse } from "./spec-complete-response";
import { SpecResponseToTestSuiteInfoMapper } from "./spec-response-to-test-suite-info-mapper";

export class TestLoadProcessor {
  public constructor(
    private readonly specToTestSuiteMapper: SpecResponseToTestSuiteInfoMapper,
    private readonly testSuiteOrganizer: TestSuiteOrganizer,
    private readonly testSuiteTreeProcessor: TestSuiteTreeProcessor,
    private readonly testGrouping: TestGrouping,
    private readonly projectRootPath: string,
    private readonly logger: Logger
  ) {}

  public processTests(loadedSpecs: SpecCompleteResponse[]): TestSuiteInfo {
    this.specToTestSuiteMapper.refresh();
    let loadedTests: TestSuiteInfo = this.specToTestSuiteMapper.map(loadedSpecs);

    if (this.testGrouping === TestGrouping.Folder) {
      loadedTests = this.testSuiteOrganizer.groupByFolder(loadedTests, this.projectRootPath);
    }

    const addTestCount = (test: AnyTestInfo, testCount: number) => {
      if (test.type === TestType.Suite) {
        test.testCount = testCount;
        test.description = testCount === 1 ? `(1 test)` : `(${testCount} tests)`;
      }
    };

    const totalTestCount = this.testSuiteTreeProcessor.processTestSuite<number>(
      loadedTests, 1, 0, addTestCount,
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

    return loadedTests;
  }
}