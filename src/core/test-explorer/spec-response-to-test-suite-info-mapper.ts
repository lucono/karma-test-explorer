import { SpecCompleteResponse } from "../../model/spec-complete-response";
import { SpecLocation } from "../helpers/spec-locator";
import { TestSuiteInfo, TestInfo } from "vscode-test-adapter-api";
import { TestType } from "../../model/enums/test-type.enum";
import { Logger } from "../helpers/logger";

export type SpecLocationResolver = (specSuite: string[], specDescription?: string) => SpecLocation[];
type DedupingSpecLocationResolver = (specSuite: string[], specDescription?: string, specFile?: string) => SpecLocation | undefined;

export class SpecResponseToTestSuiteInfoMapper {
  public constructor(private readonly specLocationResolver: SpecLocationResolver, private readonly logger: Logger) {}

  public map(specs: SpecCompleteResponse[]): TestSuiteInfo {
    let suiteIdCounter = 0

    const suiteIdProvider = () => {
      const newSuiteId = `suite_${suiteIdCounter}`;
      suiteIdCounter += 1
      return newSuiteId;
    };

    const dedupingSpecLocationResolver: DedupingSpecLocationResolver = this.createDeduplicatingSpecLocationResolver(this.specLocationResolver);

    const rootSuiteId = suiteIdProvider();
    const rootTestSuite: TestSuiteInfo = this.createRootSuite(rootSuiteId);

    specs.forEach(spec => {
      const specSuitePath = this.filterSuiteNoise(spec.suite);
      const testSuite = this.getDescendantSuite(rootTestSuite, specSuitePath, suiteIdProvider, dedupingSpecLocationResolver);
      const test = this.createTest(spec, dedupingSpecLocationResolver, testSuite.file);
      testSuite.children.push(test);
    });
    
    const totalTestCount = this.addTestCountsAndGetTotal(rootTestSuite);
    this.logger.debug(() => `Mapped ${totalTestCount} total tests from specs`);
    return rootTestSuite;
  }

  private createTest(
    specInfo: SpecCompleteResponse,
    dedupingSpecLocationResolver: DedupingSpecLocationResolver,
    specFile?: string): TestInfo
  {
    const specLocation = dedupingSpecLocationResolver(specInfo.suite, specInfo.description, specFile);
    const allSpecLocations = this.specLocationResolver(specInfo.suite);

    // const file = allSpecLocations.length === 1 ? allSpecLocations[0].file : undefined;
    // const line = allSpecLocations.length === 1 ? allSpecLocations[0].line : undefined;
    const errored = allSpecLocations.length > 1;
    const filesListing = allSpecLocations.map(location => `${location.file}:${location.line}`).join('\n');

    const loadFailureMessage = allSpecLocations.length > 1
      ? `This test has exact duplicates which could lead to conflicting results in a test run: \n\n${filesListing}`
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
      file: specLocation?.file,
      line: specLocation?.line,
      errored
    };
    return test;
  }

  private createSuite(
    suitePath: string[], 
    suiteId: string,
    allSuiteLocations: SpecLocation[], 
    suiteLocation?: SpecLocation): TestSuiteInfo
  {
    const suiteName = suitePath[suitePath.length - 1];
    const suiteFullName = suitePath.join(" ");
    const filesListing = allSuiteLocations.map(location => `${location.file}:${location.line}`).join('\n');

    const message = allSuiteLocations.length > 1
      ? `This test suite has exact duplicates which will all be run when this suite is run: \n\n${filesListing}`
      : undefined;

    const suiteNode: TestSuiteInfo = {
      type: TestType.Suite,
      id: suiteId,
      fullName: suiteFullName,
      label: suiteName,
      tooltip: suiteFullName,
      children: [],
      testCount: 0,
      file: suiteLocation?.file,
      line: suiteLocation?.line,
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

  private getDescendantSuite(
    baseNode: TestSuiteInfo, 
    suitePath: string[], 
    suiteIdGenerator: () => string, 
    dedupingSpecLocationResolver: DedupingSpecLocationResolver): TestSuiteInfo
  {
    const currentSuitePath: string[] = [];
    let currentNode: TestSuiteInfo = baseNode;

    for (const suiteName of suitePath) {
      currentSuitePath.push(suiteName);

      let nextNode = currentNode.label === suiteName
        ? currentNode
        : currentNode.children.find(child => child.type === TestType.Suite && child.label === suiteName) as TestSuiteInfo | undefined;

      if (!nextNode) {
        const nextSuiteId = suiteIdGenerator();
        const suiteLocation = dedupingSpecLocationResolver(currentSuitePath, undefined, currentNode.file);
        const allSuiteLocations = this.specLocationResolver(currentSuitePath);
        nextNode = this.createSuite(currentSuitePath, nextSuiteId, allSuiteLocations, suiteLocation);
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

  private createDeduplicatingSpecLocationResolver(specLocationResolver: SpecLocationResolver): DedupingSpecLocationResolver {
    const duplicateTopSuiteFilesBySuiteName: Map<string, string[]> = new Map();

    return (specSuite: string[], specDescription?: string, specFile?: string | undefined): SpecLocation | undefined => {

      const suiteLocations = specLocationResolver(specSuite, specDescription);
      let suiteLocation: SpecLocation | undefined;
      
      if (suiteLocations.length === 1) {
        suiteLocation = suiteLocations[0];

      } else if (suiteLocations.length > 1) {
        if (specSuite.length === 1) {
          const topSuiteName = specSuite[0];
          if (!duplicateTopSuiteFilesBySuiteName.has(topSuiteName)) {
            duplicateTopSuiteFilesBySuiteName.set(topSuiteName, suiteLocations.map(loc => loc.file));
          }
          const unreferencedSpecFiles = duplicateTopSuiteFilesBySuiteName.get(topSuiteName)!;
          if (unreferencedSpecFiles.length > 0) {
            const dedupedSpecFile = unreferencedSpecFiles.pop()!;
            suiteLocation = suiteLocations.find(loc => loc.file === dedupedSpecFile);

            if (!suiteLocation) {
              unreferencedSpecFiles.push(dedupedSpecFile);
            }
          }
        } else if (specFile) {
          suiteLocation = suiteLocations.find(loc => loc.file === specFile);
        }
      }
      return suiteLocation;
    };
  }
}