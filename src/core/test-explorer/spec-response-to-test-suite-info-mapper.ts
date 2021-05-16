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

    specs.forEach(rawSpec => {
      const spec: SpecCompleteResponse = { ...rawSpec, suite: this.filterSuiteNoise(rawSpec.suite) };
      const matchingSpecLocations = this.specLocationResolver(spec.suite, spec.description);
      let specFile: string | undefined = spec.filePath; // FIXME: Convert to absolute path

      if (matchingSpecLocations.length === 1) {
        specFile = specFile ?? matchingSpecLocations[0].file;

      } else if (matchingSpecLocations.length > 1) {
        if (!unreferencedDuplicateSpecFilesBySpec.has(spec.fullName)) {
          unreferencedDuplicateSpecFilesBySpec.set(spec.fullName, matchingSpecLocations.map(loc => loc.file));
        }
        const unreferenceMatchingSpecFiles = unreferencedDuplicateSpecFilesBySpec.get(spec.fullName)!;
        specFile = specFile ?? unreferenceMatchingSpecFiles[0];

        if (unreferenceMatchingSpecFiles.includes(specFile)) {
          unreferenceMatchingSpecFiles.splice(unreferenceMatchingSpecFiles.indexOf(specFile), 1);
        }
      }

      if (!specFile) {
        return;
      }
      const testSuite = this.getDescendantSuite(rootTestSuite, spec.suite, specFile, suiteIdGenerator);
      const test = this.createTest(spec, specFile);
      testSuite.children.push(test);
    });
    
    const totalTestCount = this.addTestCountsAndGetTotal(rootTestSuite);
    this.logger.debug(() => `Mapped ${totalTestCount} total tests from specs`);
    return rootTestSuite;
  }

  private createRootSuite(suiteId: string): TestSuiteInfo {
    const rootSuite: TestSuiteInfo = {
      type: TestType.Suite,
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

    const hasDuplicates = allMatchingSuiteLocations.length > 1;
    let message: string | undefined;

    if (hasDuplicates) {
      const duplicateSuiteFiles = allMatchingSuiteLocations
        .filter(loc => loc.file !== suiteFile)
        .map(location => `${location.file}:${location.line}`)
        .join('\n');
  
      message = 
        `This test suite has duplicate definitions which could lead to conflicting test results. \n\n` +
        `"${suiteFullName}" \n\n` +
        `---------- \n\n` +
        (suiteLocation
          ? `Defined in: \n\n` +
            `${suiteLocation.file}:${suiteLocation.line} \n\n`
          : '') +
        `Duplicate definitions: \n\n` +
        `${duplicateSuiteFiles}`;
    }

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
    specFile: string): TestInfo
  {
    const allMatchingSpecLocations = this.specLocationResolver(spec.suite, spec.description);
    const specLocation = allMatchingSpecLocations.find(loc => loc.file === specFile);

    const runFailureMessage = spec.failureMessages?.join("\n");
    let loadFailureMessage: string | undefined;

    let file = spec.filePath;
    let line = spec.line;
    let errored = false;

    if (!file || line === undefined) {
      file = specLocation?.file;
      line = specLocation?.line;
      const hasDuplicates = allMatchingSpecLocations.length > 1;

      if (hasDuplicates) {
        errored = true;

        const duplicateSpecFiles = allMatchingSpecLocations
          .filter(loc => loc.file !== specFile)
          .map(location => `${location.file}:${location.line}`)
          .join('\n');
  
        loadFailureMessage = 
          `This test has duplicate definitions which could lead to conflicting test results. \n\n` +
          `"${spec.fullName}" \n\n` +
          `---------- \n\n` +
          (specLocation
            ? `Defined in: \n\n` +
              `${specLocation.file}:${specLocation.line} \n\n`
            : '') +
          `Duplicate definitions: \n\n` +
          `${duplicateSpecFiles}`;
      }
    }

    const test: TestInfo = {
      type: TestType.Test,
      id: spec.id,
      fullName: spec.fullName,
      label: spec.description,
      tooltip: spec.fullName,
      message: runFailureMessage || loadFailureMessage,
      file,
      line,
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
}