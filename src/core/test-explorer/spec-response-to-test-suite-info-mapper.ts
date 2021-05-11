import { SpecCompleteResponse } from "../../model/spec-complete-response";
import { SpecLocation } from "../helpers/spec-locator";
import { TestSuiteInfo, TestInfo } from "vscode-test-adapter-api";
import { TestType } from "../../model/enums/test-type.enum";
import { Logger } from "../helpers/logger";

export type SpecLocationResolver = (specSuite: string[], specDescription?: string) => SpecLocation[];

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
      const specLocations = this.specLocationResolver(specSuitePath, spec.description);
      const test = this.createTest(spec, specLocations);
      const testSuite = this.getDescendantSuite(rootTestSuite, specSuitePath, suiteIdProvider);
      testSuite.children.push(test);
    });
    
    const totalTestCount = this.addTestCountsAndGetTotal(rootTestSuite);
    this.logger.debug(() => `Mapped ${totalTestCount} total tests from specs`);
    return rootTestSuite;
  }

  private createTest(specInfo: SpecCompleteResponse, specLocations: SpecLocation[]): TestInfo {
    const file = specLocations.length === 1 ? specLocations[0].file : undefined;
    const line = specLocations.length === 1 ? specLocations[0].line : undefined;
    const errored = specLocations.length > 1;
    const filesListing = specLocations.map(location => `${location.file}:${location.line}`).join('\n');

    const loadFailureMessage = specLocations.length > 1
      ? `⚠ This test has exact duplicates which could lead to conflicting results in a test run: \n${filesListing}`
      : undefined;

    const runFailureMessage = specInfo.failureMessages?.length > 0
      ? specInfo.failureMessages.join("\n")
      : undefined;

    const test: TestInfo = {
      type: TestType.Test,
      id: specInfo.id,
      fullName: specInfo.fullName,
      label: specInfo.description,
      tooltip: specInfo.fullName,
      message: runFailureMessage ?? loadFailureMessage,
      file,
      line,
      errored
    };
    return test;
  }

  private createSuite(suitePath: string[], suiteId: string): TestSuiteInfo {
    const suiteName = suitePath[suitePath.length - 1];
    const suiteFullName = suitePath.join(" ");
    const suiteLocations = this.specLocationResolver(suitePath);

    const file = suiteLocations.length === 1 ? suiteLocations[0].file : undefined;
    const line = suiteLocations.length === 1 ? suiteLocations[0].line : undefined;
    const filesListing = suiteLocations.map(location => `${location.file}:${location.line}`).join('\n');

    const message = suiteLocations.length > 1
      ? `⚠ This test suite has exact duplicates which will all be run when this suite is run: \n${filesListing}`
      : undefined;

    const suiteNode: TestSuiteInfo = {
      type: TestType.Suite,
      id: suiteId,
      fullName: suiteFullName,
      label: suiteName,
      tooltip: suiteFullName,
      children: [],
      testCount: 0,
      file,
      line,
      message
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