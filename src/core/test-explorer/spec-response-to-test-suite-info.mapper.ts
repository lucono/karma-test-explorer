import { SpecCompleteResponse } from "../../model/spec-complete-response";
import { PathFinder, SpecLocation } from "../helpers/path-finder";
import { TestSuiteInfo, TestInfo } from "vscode-test-adapter-api";
import { TestType } from "../../model/enums/test-type.enum";
import { Logger } from "../helpers/logger";

export class SpecResponseToTestSuiteInfoMapper {
  public constructor(private readonly pathFinder: PathFinder, private readonly logger: Logger) {}

  public map(specs: SpecCompleteResponse[]): TestSuiteInfo {
    const allTestSuites: Set<TestSuiteInfo> = new Set();

    const rootSuiteId = this.generateSuiteId(allTestSuites.size);
    const rootTestSuite: TestSuiteInfo = this.createRootSuite(rootSuiteId);
    allTestSuites.add(rootTestSuite);

    specs.forEach(spec => {
      const specSuitePath = this.filterSuiteNoise(spec.suite);
      const specLocation = this.pathFinder.getSpecLocation(specSuitePath, spec.description);
      const nextAvailableSuiteId = this.generateSuiteId(allTestSuites.size);

      const test = this.createTest(spec, specLocation);
      const testSuite = this.getNewOrExistingDescendantSuite(rootTestSuite, specSuitePath, nextAvailableSuiteId);
      testSuite.children.push(test);
      allTestSuites.add(testSuite);
    });
    
    const totalTestCount = this.addTestCountsAndGetTotal(rootTestSuite);
    this.logger.debug(() => `Mapped ${totalTestCount} total tests from specs`);
    return rootTestSuite;
  }

  private createTest(
    specInfo: SpecCompleteResponse, 
    // testSuite: TestSuiteInfo, 
    // suiteNames: string[],
    specLocation?: SpecLocation): TestInfo {

    // const testFullName = [...suiteNames, specInfo.description].join(" ");
    const failureMessages = specInfo.failureMessages?.length > 0
      ? specInfo.failureMessages.join("\n")
      : undefined;

    const testInfo: TestInfo = {
      type: TestType.Test,
      id: specInfo.id,
      fullName: specInfo.fullName, // testFullName,
      label: specInfo.description,
      // description: `${specComplete.timeSpentInMilliseconds} ms,
      tooltip: specInfo.fullName, // testFullName,
      message: failureMessages,
      file: specLocation?.file,
      line: specLocation?.line,
    };

    // testSuite.children.push(testInfo);
    return testInfo;
  }

  private createRootSuite(rootSuiteId: string): TestSuiteInfo {
    return {
      type: TestType.Suite,
      id: rootSuiteId,
      label: "Karma tests",
      fullName: "",
      children: [],
      testCount: 0
    };
  }

  private createSuite(suiteNames: string[], newSuiteId: string): TestSuiteInfo {
    const suiteName = suiteNames[suiteNames.length - 1];
    const suiteFullName = suiteNames.join(" ");
    const suiteLocation = this.pathFinder.getSpecLocation(suiteNames);

    const suiteNode: TestSuiteInfo = {
      type: TestType.Suite,
      id: newSuiteId,
      fullName: suiteFullName,
      label: suiteName,
      tooltip: suiteFullName,
      file: suiteLocation?.file,
      line: suiteLocation?.line,
      children: [],
      testCount: 0
    };

    return suiteNode;
  }

  private getNewOrExistingDescendantSuite(baseNode: TestSuiteInfo, suitePath: string[], nextSuiteId: string): TestSuiteInfo {
    const currentSuitePath = [] as string[];
    let currentNode = baseNode;

    for (const suiteName of suitePath) {
      currentSuitePath.push(suiteName);
      let nextNode = this.findNodeByKey(currentNode, suiteName);

      if (!nextNode) {
        nextNode = this.createSuite(currentSuitePath, nextSuiteId);
        currentNode.children.push(nextNode);
      }
      currentNode = nextNode;
    }
    return currentNode;
  }

  private addTestCountsAndGetTotal(testSuite: TestSuiteInfo): number {
    let totalTestCount = 0;

    if (testSuite.children) {
      testSuite.children.forEach(testOrSuite => {
        totalTestCount += testOrSuite.type === TestType.Test ? 1 
          : this.addTestCountsAndGetTotal(testOrSuite);
      });
    }
    testSuite.testCount = totalTestCount;
    testSuite.description = `${totalTestCount} ${totalTestCount === 1 ? 'test' : 'tests'}`;
    return totalTestCount;
  }

  private findNodeByKey(node: TestInfo | TestSuiteInfo, suiteLookup: string): TestSuiteInfo | undefined {
    if (node.type === TestType.Test) {
      return undefined;
    }

    if (node.label === suiteLookup) {
      return node;
    } else {
      for (const child of node.children) {
        if (child.type === TestType.Suite && child.label === suiteLookup) {
          return child as TestSuiteInfo;
        }
      }
    }
    return undefined;
  }

  private filterSuiteNoise(suitePath: string[]) {
    if (suitePath.length > 0 && "Jasmine__TopLevel__Suite" === suitePath[0]) {
      suitePath = suitePath.slice(1);
    }
    return suitePath;
  }

  private generateSuiteId(suiteNumber: number) {
    return `suite_${suiteNumber}`;
  }
}