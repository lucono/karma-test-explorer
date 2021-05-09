import { SpecCompleteResponse } from "../../model/spec-complete-response";
import { SpecLocator, SpecLocation } from "../helpers/spec-locator";
import { TestType, TestSuiteType } from "../../model/enums/test-type.enum";
import { Logger } from "../helpers/logger";
import { TestInfo, TestSuiteInfo, TestSuiteFolderInfo } from "vscode-test-adapter-api";
import { sep as pathSeparator, dirname, basename, normalize, join } from "path";

export class SpecResponseToFolderSuiteInfoMapper {
  public constructor(private readonly projectRootPath: string, private readonly specLocator: SpecLocator, private readonly logger: Logger) {}

  public map(specs: SpecCompleteResponse[]): TestSuiteFolderInfo {
    let suiteIdCounter = 0

    const suiteIdProvider = () => {
      const newSuiteId = `suite_${suiteIdCounter}`;
      suiteIdCounter += 1
      return newSuiteId;
    };

    const rootFolderSuite: TestSuiteFolderInfo = this.createFolderSuite(this.projectRootPath);

    specs.forEach(spec => {
      const specSuitePath = this.filterSuiteNoise(spec.suite);
      const specLocation = this.specLocator.getSpecLocation(specSuitePath, spec.description);

      const specFolder = dirname(specLocation?.file ?? this.projectRootPath);
      const specFolderSuite = this.getDescendantFolderSuite(rootFolderSuite, specFolder);

      const testSuite = this.getDescendantSuite(
        specFolderSuite as unknown as TestSuiteInfo,
        specSuitePath,
        suiteIdProvider);

      const test = this.createTest(spec, specLocation);
      testSuite.children.push(test);
    });
    
    const totalTestCount = this.addTestCountsAndGetTotal(rootFolderSuite as unknown as TestSuiteInfo);
    this.logger.debug(() => `Mapped ${totalTestCount} total tests from specs`);
    return rootFolderSuite;
  }

  private createTest(specInfo: SpecCompleteResponse, specLocation?: SpecLocation): TestInfo {
    const failureMessages = specInfo.failureMessages?.length > 0
      ? specInfo.failureMessages.join("\n")
      : undefined;

    return {
      type: TestType.Test,
      id: specInfo.id,
      fullName: specInfo.fullName,
      label: specInfo.description,
      tooltip: specInfo.fullName,
      message: failureMessages,
      file: specLocation?.file,
      line: specLocation?.line,
    };
  }

  private createTestSuite(suitePath: string[], suiteId: string): TestSuiteInfo {
    const suiteName = suitePath[suitePath.length - 1];
    const suiteFullName = suitePath.join(" ");
    const suiteLocation = this.specLocator.getSpecLocation(suitePath);

    return {
      type: TestType.Suite,
      suiteType: TestSuiteType.Suite,
      id: suiteId,
      fullName: suiteFullName,
      label: suiteName,
      tooltip: suiteFullName,
      file: suiteLocation?.file,
      line: suiteLocation?.line,
      children: [],
      testCount: 0
    };
  }

  private createFolderSuite(path: string): TestSuiteFolderInfo {
    const folderPath = normalize(path);
    const folderName = basename(folderPath);

    return {
      type: TestType.Suite,
      suiteType: TestSuiteType.Folder,
      path: folderPath,
      id: folderPath,
      fullName: folderPath,
      label: folderName,
      tooltip: folderPath,
      children: [],
      testCount: 0
    };
  }

  private getDescendantFolderSuite(baseFolderNode: TestSuiteFolderInfo, folderPath: string): TestSuiteFolderInfo {
    const pathSegments = folderPath.split(pathSeparator);
    const currentFolderPathSegments = [] as string[];
    let currentFolderNode: TestSuiteFolderInfo = baseFolderNode;

    for (const folderName of pathSegments) {
      currentFolderPathSegments.push(folderName);
      const currentFolderPath = join(...currentFolderPathSegments);

      let nextFolderNode = currentFolderNode.path === currentFolderPath
        ? currentFolderNode
        : currentFolderNode.children.find(child => {
            return child.suiteType === TestSuiteType.Folder && child.path === currentFolderPath;
        }) as TestSuiteFolderInfo | undefined;

      if (!nextFolderNode) {
        nextFolderNode = this.createFolderSuite(currentFolderPath);
        currentFolderNode.children.push(nextFolderNode);
      }
      currentFolderNode = nextFolderNode;
    }
    return currentFolderNode;
  }

  private getDescendantSuite(baseNode: TestSuiteInfo, suitePath: string[], suiteIdGenerator: () => string): TestSuiteInfo {
    const currentSuitePath = [] as string[];
    let currentNode: TestSuiteInfo = baseNode;

    for (const suiteName of suitePath) {
      currentSuitePath.push(suiteName);

      let nextNode = currentNode.label === suiteName
        ? currentNode
        : currentNode.children.find(child => child.type === TestType.Suite && child.label === suiteName) as TestSuiteInfo | undefined;

      if (!nextNode) {
        const nextSuiteId = suiteIdGenerator();
        nextNode = this.createTestSuite(currentSuitePath, nextSuiteId);
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