import { TestType, TestSuiteType } from "../../model/enums/test-type.enum";
import { Logger } from "../helpers/logger";
import { TestInfo, TestSuiteInfo, TestSuiteFolderInfo } from "vscode-test-adapter-api";
import { sep as pathSeparator, dirname, basename, normalize, join } from "path";

export class TestSuiteOrganizer {
  public constructor(private readonly logger: Logger) {}

  public groupByFolder(tests: (TestInfo | TestSuiteInfo)[], rootPath: string): TestSuiteFolderInfo {
    const rootFolderSuite: TestSuiteFolderInfo = this.createFolderSuite(rootPath);

    tests.forEach(test => {
      if (test.type === TestType.Test) {
        throw new Error(`Got unexpected test instead of test suite: ${JSON.stringify(test)}`);
      }
      const specFolder: string = dirname(test.file ?? "") || rootPath;
      const specFolderSuite = this.getDescendantFolderSuite(rootFolderSuite, specFolder);
      specFolderSuite.children.push(test);
    });
    
    const totalTestCount = this.addTestCountsAndGetTotal(rootFolderSuite as unknown as TestSuiteInfo);
    this.logger.debug(() => `Mapped ${totalTestCount} total tests from specs`);
    return rootFolderSuite;
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
}