import { SpecCompleteResponse } from "../../model/spec-complete-response";
import { SpecLocation } from "../helpers/spec-locator";
import { TestSuiteInfo, TestInfo } from "vscode-test-adapter-api";
import { TestType } from "../../model/enums/test-type.enum";
import { Logger } from "../helpers/logger";

// FIXME: Move to interface in spec-locator module
export type SpecLocationResolver = (specSuite: string[], specDescription?: string) => SpecLocation[];

export class SpecResponseToTestSuiteInfoMapper {
  public constructor(
    private readonly specLocationResolver: SpecLocationResolver,
    private readonly logger: Logger)
  {}

  public map(specs: SpecCompleteResponse[]): TestSuiteInfo {
    let suiteIdCounter = 0

    const suiteIdGenerator = () => {
      const newSuiteId = `suite_${suiteIdCounter}`;
      suiteIdCounter += 1;
      return newSuiteId;
    };

    const rootSuiteId = suiteIdGenerator();
    const rootTestSuite: TestSuiteInfo = this.createRootSuite(rootSuiteId);
    const unreferencedDuplicateSpecFilesBySpec: Map<string, string[]> = new Map();

    specs.forEach(spec => {
      const specSuitePath = this.filterSuiteNoise(spec.suite);
      const matchingSpecLocations = this.specLocationResolver(specSuitePath, spec.description);
      let specFile: string | undefined;

      if (matchingSpecLocations.length === 1) {
        specFile = matchingSpecLocations[0].file;

      } else if (matchingSpecLocations.length > 1) {
        if (!unreferencedDuplicateSpecFilesBySpec.has(spec.fullName)) {
          unreferencedDuplicateSpecFilesBySpec.set(spec.fullName, matchingSpecLocations.map(loc => loc.file));
        }
        specFile = unreferencedDuplicateSpecFilesBySpec.get(spec.fullName)!.pop();
      }

      if (!specFile) {
        return;
      }
      const testSuite = this.getDescendantSuite(rootTestSuite, specSuitePath, specFile, suiteIdGenerator);
      const test = this.createTest(spec, specSuitePath, specFile);
      testSuite.children.push(test);
    });
    
    const totalTestCount = this.addTestCountsAndGetTotal(rootTestSuite);
    this.logger.debug(() => `Mapped ${totalTestCount} total tests from specs`);
    return rootTestSuite;
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
    specFile: string,
    suiteIdGenerator: () => string): TestSuiteInfo
  {
    const currentSuitePath: string[] = [];
    let currentNode: TestSuiteInfo = baseNode;

    for (const suiteName of suitePath) {
      currentSuitePath.push(suiteName);

      let nextNode = currentNode.label === suiteName && currentNode.file === specFile
        ? currentNode
        : currentNode.children.find(child => {
          return child.type === TestType.Suite && child.label === suiteName && child.file === specFile;
        }) as TestSuiteInfo | undefined;

      if (!nextNode) {
        const nextSuiteId = suiteIdGenerator();
        nextNode = this.createSuite(currentSuitePath, specFile, nextSuiteId);
        currentNode.children.push(nextNode);
      }
      currentNode = nextNode;
    }
    return currentNode;
  }

  private createSuite(
    suitePath: string[], 
    suiteFile: string,
    suiteId: string): TestSuiteInfo
  {
    const allMatchingSuiteLocations = this.specLocationResolver(suitePath);
    const suiteLocation = allMatchingSuiteLocations.find(loc => loc.file === suiteFile);
    const suiteName = suitePath[suitePath.length - 1];
    const suiteFullName = suitePath.join(" ");
    const filesListing = allMatchingSuiteLocations.map(loc => `${loc.file}:${loc.line}`).join('\n');

    const message = allMatchingSuiteLocations.length > 1
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

  private createTest(
    spec: SpecCompleteResponse,
    specSuite: string[],
    specFile: string): TestInfo
  {
    const allMatchingSpecLocations = this.specLocationResolver(specSuite);
    const specLocation = allMatchingSpecLocations.find(loc => loc.file === specFile);

    // const file = allSpecLocations.length === 1 ? allSpecLocations[0].file : undefined;
    // const line = allSpecLocations.length === 1 ? allSpecLocations[0].line : undefined;
    const errored = allMatchingSpecLocations.length > 1;
    const filesListing = allMatchingSpecLocations.map(location => `${location.file}:${location.line}`).join('\n');

    const loadFailureMessage = allMatchingSpecLocations.length > 1
      ? `This test has exact duplicates which could lead to conflicting results in a test run: \n\n${filesListing}`
      : undefined;

    const runFailureMessage = spec.failureMessages?.length > 0
      ? spec.failureMessages.join("\n")
      : undefined;

    const test: TestInfo = {
      type: TestType.Test,
      id: spec.id,
      fullName: spec.fullName,
      label: spec.description,
      tooltip: spec.fullName,
      message: runFailureMessage ?? loadFailureMessage,
      file: specLocation?.file,
      line: specLocation?.line,
      errored
    };
    return test;
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

  // private createDeduplicatingSpecLocationResolver(specLocationResolver: SpecLocationResolver): DedupingSpecLocationResolver {
  //   const duplicateTopSuiteFilesBySuiteName: Map<string, string[]> = new Map();

  //   return (specSuite: string[], specDescription?: string, specFile?: string | undefined): SpecLocation | undefined => {

  //     const suiteLocations = specLocationResolver(specSuite, specDescription);
  //     let suiteLocation: SpecLocation | undefined;
      
  //     if (suiteLocations.length === 1) {
  //       suiteLocation = suiteLocations[0];

  //     } else if (suiteLocations.length > 1) {
  //       if (specSuite.length === 1) {
  //         const topSuiteName = specSuite[0];
  //         if (!duplicateTopSuiteFilesBySuiteName.has(topSuiteName)) {
  //           duplicateTopSuiteFilesBySuiteName.set(topSuiteName, suiteLocations.map(loc => loc.file));
  //         }
  //         const unreferencedSpecFiles = duplicateTopSuiteFilesBySuiteName.get(topSuiteName)!;
  //         if (unreferencedSpecFiles.length > 0) {
  //           const dedupedSpecFile = unreferencedSpecFiles.pop()!;
  //           suiteLocation = suiteLocations.find(loc => loc.file === dedupedSpecFile);

  //           if (!suiteLocation) {
  //             unreferencedSpecFiles.push(dedupedSpecFile);
  //           }
  //         }
  //       } else if (specFile) {
  //         suiteLocation = suiteLocations.find(loc => loc.file === specFile);
  //       }
  //     }
  //     return suiteLocation;
  //   };
  // }
}