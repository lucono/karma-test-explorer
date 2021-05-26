import { TestInfo, TestSuiteInfo } from "vscode-test-adapter-api";
import { Disposable } from "../api/disposable";
import { TestType } from "../api/test-infos";
import { Logger } from "../util/logger";

type TestItemOrList = TestInfo | TestSuiteInfo | (TestInfo | TestSuiteInfo)[];

export type TestWeightResolver = (...tests: (TestInfo | TestSuiteInfo)[]) => number;

const testCountTestWeightResolver: TestWeightResolver = (...tests) => {
  return tests.length === 0 ? 0 : tests
    .map(test => test.type === TestType.Test ? 1 : test.testCount)
    .reduce((runningTotal, newCount) => runningTotal + newCount);
}

export class ShardManager implements Disposable {

  public constructor(
    private readonly shardCount: number,
    private readonly logger: Logger,
    private readonly testWeightResolver: TestWeightResolver = testCountTestWeightResolver)
  {}

  public divideTests(
    tests: (TestInfo | TestSuiteInfo)[]): (TestInfo | TestSuiteInfo)[][]
  {
    const totalTestWeight = this.testWeightResolver(...tests);
    const maxWeightPerShard = Math.ceil(totalTestWeight / this.shardCount); // FIXME: Add % tolerance to max weight
    const shardBuckets: (TestInfo | TestSuiteInfo)[][] = Array.from({ length: this.shardCount }, () => []);

    const decomposedTestsForSharding: (TestInfo | TestSuiteInfo)[] = [];
    const bfsQueue: (TestInfo | TestSuiteInfo)[] = [ ...tests ];

    while (bfsQueue.length > 0) {
      const nextTest: TestInfo | TestSuiteInfo = bfsQueue.shift()!;
      const testWeight = this.testWeightResolver(nextTest);
      
      if (nextTest.type === TestType.Test || testWeight <= maxWeightPerShard) {
        decomposedTestsForSharding.push(nextTest);
        continue;
      }
      // FIXME: Possible optimization for minimal # of items - 
      // count how many of children are TestInfo and note it 
      // (greatest inidividual test count in encountered suites) 
      // against testCount of containing test suite (lowest suite 
      // test count with the greatest individual child tests) so 
      // that can increase maxTestPerShard threshold to that value 
      // for new attempt pass to produce less individual tests.
      bfsQueue.push(...nextTest.children);
    }

    const ascendingTestWeightComparator = (testSet1: TestItemOrList, testSet2: TestItemOrList): number => {
      return this.getTestWeight(testSet1) - this.getTestWeight(testSet2);
    }

    const descendingTestWeightComparator = (testSet1: TestItemOrList, testSet2: TestItemOrList) => {
      return ascendingTestWeightComparator(testSet2, testSet1);
    }
  
    decomposedTestsForSharding.sort(descendingTestWeightComparator).forEach(test => {
      const lightestShard = shardBuckets.sort(ascendingTestWeightComparator)[0];
      lightestShard.push(test);
    });

    this.logger.info(`--- Shard results: ---`);
    shardBuckets.forEach((shard, index) => this.logger.info(
      `shard ${index} weight: ${this.getTestWeight(shard)} (${shard.length} items)`)
    );
    this.logger.info(`----------------------`);

    return shardBuckets;
  }

  private getTestWeight(tests: TestItemOrList): number {
    return Array.isArray(tests)
      ? this.testWeightResolver(...tests)
      : this.testWeightResolver(tests);
  }

  public dispose() {
    this.logger.dispose();
  }
}
