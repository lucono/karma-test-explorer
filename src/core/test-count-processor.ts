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
    }
    testCountProcessor(testSuite, totalTestCount);

    this.logger.debug(() => `Added test counts for suite of total ${totalTestCount} tests`);
    return totalTestCount;
  }

  // private process<S>(
  //   test: AnyTestInfo,
  //   testProcessor: (test: AnyTestInfo, result: S | undefined) => void,
  //   aggregator: (aggregate: S | undefined, newItem: S) => S): S
  // {
  //   let result: S | undefined;

  //   if ('children' in test) {
  //     result = test.children
  //       .map((child: AnyTestInfo) => this.process(child, testProcessor, aggregator))
  //       .reduce(aggregator);
  //   }
  //   testProcessor(test, result);
  //   return result;
  // }
}