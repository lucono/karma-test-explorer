import { Logger } from "./logger";
import { TestInfo, TestSuiteInfo } from "vscode-test-adapter-api";
import { sep as pathSeparator, dirname, basename, normalize, relative, join } from "path";
import { AnyTestInfo, TestFileSuiteInfo, TestFolderSuiteInfo, TestSuiteType, TestType } from "../api/test-infos";
import { TestGrouping } from "../api/test-grouping";

const defaultTestSuiteOrganizerOptions: Required<TestSuiteOrganizerOptions> = {
  collapseSingleFolders: true,
  testGrouping: TestGrouping.Folder
};

export interface TestSuiteOrganizerOptions {
  testGrouping?: TestGrouping;
  collapseSingleFolders?: boolean;
}

export class TestSuiteOrganizer {
  public constructor(private readonly logger: Logger) {}

  public organizeTests(
    rootSuite: TestSuiteInfo,
    rootPath: string,
    options: TestSuiteOrganizerOptions = defaultTestSuiteOrganizerOptions): TestSuiteInfo
  {
    const allOptions: Required<TestSuiteOrganizerOptions> = { ...defaultTestSuiteOrganizerOptions, ...options };

    const groupedTestSuite: TestSuiteInfo = allOptions.testGrouping === TestGrouping.Folder
      ? this.groupByFolder(rootSuite, rootPath, allOptions.collapseSingleFolders)
      : rootSuite;
    
    this.sortTestTree(groupedTestSuite);

    return groupedTestSuite;
  }

  private groupByFolder(
    rootSuite: TestSuiteInfo,
    rootPath: string,
    collapseSingleFolders: boolean): TestSuiteInfo
  {
    const tests: (TestInfo | TestSuiteInfo)[] = rootSuite.children;
    const testFileSuitesByFilePath: Map<string, TestFileSuiteInfo> = new Map();
    const fileLessSpecsSuite: TestSuiteInfo[] = [];

    tests.forEach(test => {

      if (test.type === TestType.Test) {  // FIXME: Should never be true. Use type system to eliminate need for check
        this.logger.warn(
          `Got test with unknown top-level test suite: ` +
          `${JSON.stringify(test)} - ` +
          `Test will be ignored`);

        return;
      }
      if (!test.file) {
        this.logger.warn(`Got test with unknown file: ${JSON.stringify(test)}`);
        fileLessSpecsSuite.push(test);
        return;
      }
      // const testFileRelativePath: string = relative(rootPath, test.file);
      let testFileSuite: TestFileSuiteInfo | undefined = testFileSuitesByFilePath.get(test.file);

      if (!testFileSuite) {
        testFileSuite = this.createTestFileSuite(rootPath, test.file);
        testFileSuitesByFilePath.set(test.file, testFileSuite);
      }
      testFileSuite.children.push(test);
    });

    const rootFolderSuite: TestFolderSuiteInfo = this.createFolderSuite(rootPath);
    rootFolderSuite.label = '.';
    
    testFileSuitesByFilePath.forEach(testFileSuite => {
      const testSuiteFolder = dirname(testFileSuite.file);
      const specFolderSuite = this.getDescendantFolderSuite(rootFolderSuite, testSuiteFolder);
      specFolderSuite.children.push(testFileSuite);
    });

    fileLessSpecsSuite.forEach(fileLessTestSuite => {
      const fileLessTestFileSuite: TestFileSuiteInfo = {
        ...fileLessTestSuite,
        type: TestType.Suite,
        suiteType: TestSuiteType.File,
        file: '',
        line: undefined,
        testCount: 0,
        message: `Could not determine the file for this test suite`
      };
      rootFolderSuite.children.push(fileLessTestFileSuite);
    });
    
    this.logger.debug(() => `Rearranged ${testFileSuitesByFilePath.size} test files into folders`);

    const collapsedFolderSuiteTree: TestFolderSuiteInfo = collapseSingleFolders
      ? this.collapseSingleChildSuites(rootFolderSuite)
      : rootFolderSuite;
      
    const folderGroupedRootSuite = { ...rootSuite, children: [ collapsedFolderSuiteTree ] };
    return folderGroupedRootSuite;
  }

  private collapseSingleChildSuites(suite: TestFolderSuiteInfo): TestFolderSuiteInfo {
    suite.children = suite.children.map(childSuite => {
      if (childSuite.suiteType === TestSuiteType.Folder) {
        return this.collapseSingleChildSuites(childSuite);

      } else if (childSuite.suiteType === TestSuiteType.File) {
        const singleChild = childSuite.children.length === 1 ? childSuite.children[0] : undefined;
        
        return !singleChild || singleChild.type !== TestType.Suite ? childSuite : {
          ...singleChild,
          suiteType: TestSuiteType.File,
          file: singleChild.file!
        };
      }
      return childSuite;
    });

    let replacementSuite: TestFolderSuiteInfo = suite;
    
    if (suite.children.length === 1 && suite.children[0].suiteType === TestSuiteType.Folder) {
      const singleChildFolderSuite: TestFolderSuiteInfo = suite.children[0];
      singleChildFolderSuite.label = join(suite.label, singleChildFolderSuite.label);
      replacementSuite = singleChildFolderSuite;
    }
    return replacementSuite;
  }

  private sortTestTree(test: TestSuiteInfo | TestFileSuiteInfo | TestFolderSuiteInfo) {
    test.children.sort(this.compareTests);
    
    test.children.forEach(childTest => {
      if (childTest.type === TestType.Suite) {
        this.sortTestTree(childTest);
      }
    });
  }

  private compareTests(test1: AnyTestInfo, test2: AnyTestInfo): number
  {
    const computeSuiteRank = (test: AnyTestInfo): number =>
      'suiteType' in test && test.suiteType === TestSuiteType.Folder ? 0
        : 'suiteType' in test && test.suiteType === TestSuiteType.File && !test.fullName ? 1
        // : test.type === TestType.Suite ? 2
        : 2;

    const suite1Rank = computeSuiteRank(test1);
    const suite2Rank = computeSuiteRank(test2);

    return suite1Rank !== suite2Rank ? suite1Rank - suite2Rank
      : test1.file && test2.file && test1.file !== test2.file ?
          (test1.file.toLocaleLowerCase() < test2.file.toLocaleLowerCase() ? -1 : 1)
      : test1.line !== undefined && test2.line !== undefined ? test1.line - test2.line
      : test1.label.toLocaleLowerCase() < test2.label.toLocaleLowerCase() ? -1
      : 1;
  }

  private createFolderSuite(relativePath: string): TestFolderSuiteInfo {
    const folderPath = normalize(relativePath);
    const folderName = basename(folderPath);

    return {
      type: TestType.Suite,
      suiteType: TestSuiteType.Folder,
      path: folderPath,
      id: folderPath,
      fullName: '', // To prevent being runnable with grep pattern of fullName
      label: folderName,
      tooltip: folderPath,
      children: [],
      testCount: 0
    };
  }

  private createTestFileSuite(rootPath: string, absoluteFilePath: string): TestFileSuiteInfo {
    const relativeFilePath = relative(rootPath, absoluteFilePath);
    const fileSuiteId = `${absoluteFilePath}:`;

    const fileSuiteLabel = basename(absoluteFilePath).replace(
      /^(test[_\.-])?([^\.]*)([_\.-]test)?(\..*)$/i,
      '$2');

    return {
      type: TestType.Suite,
      suiteType: TestSuiteType.File,
      file: absoluteFilePath,
      line: 0,
      id: fileSuiteId,
      fullName: '', // To prevent being runnable with grep pattern of fullName
      label: fileSuiteLabel,
      tooltip: relativeFilePath,
      children: [],
      testCount: 0
    };
  }

  private getDescendantFolderSuite(baseFolderNode: TestFolderSuiteInfo, folderAbsolutePath: string): TestFolderSuiteInfo {
    const relativePathFromBase = relative(baseFolderNode.path, folderAbsolutePath);
    const pathSegments = relativePathFromBase.split(pathSeparator);
    const currentFolderPathSegments = [] as string[];
    let currentFolderNode: TestFolderSuiteInfo = baseFolderNode;

    for (const folderName of pathSegments) {
      currentFolderPathSegments.push(folderName);
      const currentFolderPath = join(...currentFolderPathSegments);

      let nextFolderNode = currentFolderNode.path === currentFolderPath
        ? currentFolderNode
        : currentFolderNode.children.find(child => {
            return child.suiteType === TestSuiteType.Folder && child.path === currentFolderPath;
        }) as TestFolderSuiteInfo | undefined;

      if (!nextFolderNode) {
        nextFolderNode = this.createFolderSuite(currentFolderPath);
        currentFolderNode.children.push(nextFolderNode);
      }
      currentFolderNode = nextFolderNode;
    }
    return currentFolderNode;
  }
}
