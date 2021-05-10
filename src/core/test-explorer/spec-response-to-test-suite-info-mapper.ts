import { SpecCompleteResponse } from "../../model/spec-complete-response";
import { SpecLocation } from "../helpers/spec-locator";
import { TestSuiteInfo, TestInfo } from "vscode-test-adapter-api";
import { TestType } from "../../model/enums/test-type.enum";
import { Logger } from "../helpers/logger";

export type SpecLocationResolver = (specSuite: string[], specDescription?: string) => SpecLocation | undefined;

export class SpecResponseToTestSuiteInfoMapper {
  public constructor(private readonly specLocationResolver: SpecLocationResolver, private readonly logger: Logger) {}

  public map(specs: SpecCompleteResponse[]): TestSuiteInfo {
    let suiteIdCounter = 0

    const suiteIdProvider = () => {
      const newSuiteId = `suite_${suiteIdCounter}`;
      suiteIdCounter += 1
      return newSuiteId;
    };

    const rootSuiteId = suiteIdProvider();
    const rootTestSuite: TestSuiteInfo = this.createRootSuite(rootSuiteId);

    specs.forEach(spec => {
      const specSuitePath = this.filterSuiteNoise(spec.suite);
      const specLocation = this.specLocationResolver(specSuitePath, spec.description);
      const test = this.createTest(spec, specLocation);
      const testSuite = this.getDescendantSuite(rootTestSuite, specSuitePath, suiteIdProvider);
      testSuite.children.push(test);
    });
    
    const totalTestCount = this.addTestCountsAndGetTotal(rootTestSuite);
    this.logger.debug(() => `Mapped ${totalTestCount} total tests from specs`);
    return rootTestSuite;
  }

  private createTest(specInfo: SpecCompleteResponse, specLocation?: SpecLocation): TestInfo {
    const failureMessages = specInfo.failureMessages?.length > 0
      ? specInfo.failureMessages.join("\n")
      : undefined;

    const test: TestInfo = {
      type: TestType.Test,
      id: specInfo.id,
      fullName: specInfo.fullName,
      label: specInfo.description,
      tooltip: specInfo.fullName,
      message: failureMessages,
      file: specLocation?.file,
      line: specLocation?.line,
    };
    return test;
  }

  private createSuite(suitePath: string[], suiteId: string): TestSuiteInfo {
    const suiteName = suitePath[suitePath.length - 1];
    const suiteFullName = suitePath.join(" ");
    const suiteLocation = this.specLocationResolver(suitePath);

    const suiteNode: TestSuiteInfo = {
      type: TestType.Suite,
      // suiteType: TestSuiteType.Suite,
      id: suiteId,
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

  private createRootSuite(suiteId: string): TestSuiteInfo {
    const rootSuite: TestSuiteInfo = {
      type: TestType.Suite,
      // suiteType: TestSuiteType.Suite,
      id: suiteId,
      label: "Karma tests",
      fullName: "",
      children: [],
      testCount: 0
    };
    return rootSuite;
  }

  private getDescendantSuite(baseNode: TestSuiteInfo, suitePath: string[], suiteIdGenerator: () => string): TestSuiteInfo {
    const currentSuitePath: string[] = [];
    let currentNode: TestSuiteInfo = baseNode;

    for (const suiteName of suitePath) {
      currentSuitePath.push(suiteName);

      let nextNode = currentNode.label === suiteName
        ? currentNode
        : currentNode.children.find(child => child.type === TestType.Suite && child.label === suiteName) as TestSuiteInfo | undefined;

      if (!nextNode) {
        const nextSuiteId = suiteIdGenerator();
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
    testSuite.description = `(${totalTestCount} ${totalTestCount === 1 ? 'test' : 'tests'})`;
    return totalTestCount;
  }

  private filterSuiteNoise(suitePath: string[]) {
    if (suitePath.length > 0 && "Jasmine__TopLevel__Suite" === suitePath[0]) {
      suitePath = suitePath.slice(1);
    }
    return suitePath;
  }
}