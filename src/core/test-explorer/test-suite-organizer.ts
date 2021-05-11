import { TestType, TestSuiteType } from "../../model/enums/test-type.enum";
import { Logger } from "../helpers/logger";
import { TestInfo, TestSuiteInfo, TestFolderSuiteInfo, TestFileSuiteInfo } from "vscode-test-adapter-api";
import { sep as pathSeparator, dirname, basename, normalize, relative, join } from "path";

export class TestSuiteOrganizer {
  public constructor(private readonly logger: Logger) {}

  public groupByFolder(rootSuite: TestSuiteInfo, rootPath: string): TestSuiteInfo {
    const tests: (TestInfo | TestSuiteInfo)[] = rootSuite.children;

    const originalTestSuitesByFile: Map<string, TestSuiteInfo> = new Map();
    const convertedTestFileSuitesByFile: Map<string, TestFileSuiteInfo> = new Map();
    const fileLessSpecsSuite: TestSuiteInfo[] = [];
    // const unknownTopSuiteTests: TestInfo[] = [];

    tests.forEach(test => {

      if (test.type === TestType.Test) {  // FIXME: Should never be true. Use type system to eliminate need for check
        this.logger.warn(
          `Got test with unknown top-level test suite: ${JSON.stringify(test)} - ` +
          `Test will be ignored`);
        // unknownTopSuiteTests.push(test);
        return;
      }
      
      if (!test.file) {
        this.logger.warn(`Got test with unknown file: ${JSON.stringify(test)}`);
        fileLessSpecsSuite.push(test);
        return;
      }
      
      const previousFileSuite: TestFileSuiteInfo | undefined = convertedTestFileSuitesByFile.get(test.file);

      if (!previousFileSuite) {
        const convertedTestFileSuite: TestFileSuiteInfo = {
          ...test,
          suiteType: TestSuiteType.File,
          file: test.file
        };
        convertedTestFileSuitesByFile.set(test.file, convertedTestFileSuite);
        originalTestSuitesByFile.set(test.file, test);

      } else {
        if (previousFileSuite.id === test.file) {
          previousFileSuite.children.push(test);
        } else {
          const specFileName = basename(test.file);
          const indexOfFileExtension = specFileName.indexOf('.');
          const specFileRelativePath: string = relative(rootPath, test.file);

          const fileNameWithoutExtension = indexOfFileExtension > 0
            ? specFileName.substring(0, indexOfFileExtension)
            : specFileName;  

          const multiTopLevelFileSuite: TestFileSuiteInfo = {
            type: TestType.Suite,
            suiteType: TestSuiteType.File,
            file: test.file,
            line: 0,
            id: test.file,
            fullName: '', // To prevent being runnable with grep pattern of fullName
            label: fileNameWithoutExtension,
            testCount: 0,
            debuggable: test.debuggable,
            tooltip: specFileRelativePath,
            children: []
            // description: undefined,
            // errored: false,
            // message: undefined
          };
          const originalTestSuite: TestSuiteInfo = originalTestSuitesByFile.get(test.file)!;
          multiTopLevelFileSuite.children.push(originalTestSuite);
          multiTopLevelFileSuite.children.push(test);
          convertedTestFileSuitesByFile.set(test.file, multiTopLevelFileSuite);
        }
      }
    });

    const rootFolderSuite: TestFolderSuiteInfo = this.createFolderSuite(rootPath);
    rootFolderSuite.label = '.';
    
    convertedTestFileSuitesByFile.forEach(testFileSuite => {
      const specFolderRelativePath: string = relative(rootPath, dirname(testFileSuite.file));
      const specFolderSuite = this.getDescendantFolderSuite(rootFolderSuite, specFolderRelativePath);
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
        message: `Could not determine the file for this test suite`,
        // id: fileLessTestSuite.id,
        // label: fileLessTestSuite.label,
        // children: fileLessTestSuite.children,
        // fullName: fileLessTestSuite.fullName,
        // -----
        // debuggable: fileLessTestSuite.debuggable,
        // tooltip: fileLessTestSuite.tooltip,
        // description: undefined,
        // errored: false
      };
      rootFolderSuite.children.push(fileLessTestFileSuite);
    });
    
    const totalTestCount = this.addTestCountsAndGetTotal(rootFolderSuite);
    this.logger.debug(() => `Mapped ${totalTestCount} total tests from specs`);

    this.sortTestTree(rootFolderSuite);

    const collapsedFolderSuiteTree: TestFolderSuiteInfo = this.collapseSingleChildSuites(rootFolderSuite);
    const folderGroupedRootSuite = { ...rootSuite, children: [ collapsedFolderSuiteTree ] };
    return folderGroupedRootSuite;
  }

  private collapseSingleChildSuites(suite: TestFolderSuiteInfo): TestFolderSuiteInfo {
    suite.children = suite.children.map(childSuite => childSuite.suiteType === TestSuiteType.Folder
      ? this.collapseSingleChildSuites(childSuite)
      : childSuite);

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

  private compareTests(
    test1: TestInfo | TestSuiteInfo | TestFileSuiteInfo | TestFolderSuiteInfo,
    test2: TestInfo | TestSuiteInfo | TestFileSuiteInfo | TestFolderSuiteInfo): number
  {
    const computeSuiteRank = (test: TestInfo | TestSuiteInfo | TestFileSuiteInfo | TestFolderSuiteInfo): number =>
      test.type === TestType.Test ? 0
        : 'suiteType' in test && test.suiteType === TestSuiteType.Folder ? 4
        : 'suiteType' in test && test.suiteType === TestSuiteType.File && !test.fullName ? 3
        : test.type === TestType.Suite ? 2
        : 1;

    const suite1Rank = computeSuiteRank(test1);
    const suite2Rank = computeSuiteRank(test2);

    return suite1Rank !== suite2Rank ? suite1Rank - suite2Rank
      : test1.label < test2.label ? -1
      : test1.label > test2.label ? 1
      : 0;
  }

  private createFolderSuite(path: string): TestFolderSuiteInfo {
    const folderPath = normalize(path);
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

  private getDescendantFolderSuite(baseFolderNode: TestFolderSuiteInfo, folderPath: string): TestFolderSuiteInfo {
    const pathSegments = folderPath.split(pathSeparator);
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