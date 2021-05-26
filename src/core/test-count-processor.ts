import { TestSuiteInfo } from "vscode-test-adapter-api";
import { TestType } from "../api/test-infos";
import { Logger } from "../util/logger";

export class TestCountProcessor {

  public constructor(private readonly logger: Logger) {}

  public addTestCounts(
    testSuite: TestSuiteInfo,
    testCountProcessor: (test: TestSuiteInfo, totalTestCount: number) => void): number
  {
    let totalTestCount = 0;

    if (testSuite.children) {
      testSuite.children.forEach(testOrSuite => {
        totalTestCount += testOrSuite.type === TestType.Test
          ? 1
          : this.addTestCounts(testOrSuite, testCountProcessor);
      });
    } else {
      this.logger.debug(() => `Encountered empty test suite: ${testSuite.id}`);
    }
    testCountProcessor(testSuite, totalTestCount);

    return totalTestCount;
  }
}