import { basename, dirname, isAbsolute, normalize, posix, relative, resolve, sep as pathSeparator } from 'path';
import { TestInfo, TestSuiteInfo } from 'vscode-test-adapter-api';
import { Disposable } from '../util/disposable/disposable';
import { Disposer } from '../util/disposable/disposer';
import { Logger } from '../util/logging/logger';
import { TestGrouping } from './base/test-grouping';
import { AnyTestInfo, TestFileSuiteInfo, TestFolderSuiteInfo, TestSuiteType, TestType } from './base/test-infos';

const defaultTestSuiteOrganizerOptions: Required<TestSuiteOrganizationOptions> = {
  testGrouping: TestGrouping.Folder,
  flattenSingleChildFolders: true,
  flattenSingleSuiteFiles: true
};

interface TestSuiteFolderGroupingOptions {
  flattenSingleChildFolders: boolean;
  flattenSingleSuiteFiles: boolean;
}

export interface TestSuiteOrganizationOptions extends Partial<TestSuiteFolderGroupingOptions> {
  testGrouping?: TestGrouping;
}

export class TestSuiteOrganizer implements Disposable {
  private readonly disposables: Disposable[] = [];

  public constructor(private readonly logger: Logger) {
    this.disposables.push(logger);
  }

  public organizeTests(
    rootSuite: TestSuiteInfo,
    rootPath: string,
    testsBasePath: string,
    options?: TestSuiteOrganizationOptions
  ): TestSuiteInfo {
    const allOptions: Required<TestSuiteOrganizationOptions> = {
      ...defaultTestSuiteOrganizerOptions,
      ...options
    };

    const adjustedBasePath = this.isChildPath(rootPath, testsBasePath) ? testsBasePath : rootPath;

    const groupedTestSuite: TestSuiteInfo =
      allOptions.testGrouping === TestGrouping.Folder
        ? this.groupByFolder(rootSuite, adjustedBasePath, allOptions)
        : rootSuite;

    this.sortTestTree(groupedTestSuite);

    return groupedTestSuite;
  }

  private groupByFolder(
    rootSuite: TestSuiteInfo,
    basePath: string,
    groupingOptions: TestSuiteFolderGroupingOptions
  ): TestSuiteInfo {
    const tests: (TestInfo | TestSuiteInfo)[] = rootSuite.children;
    const testFileSuitesByFilePath: Map<string, TestFileSuiteInfo> = new Map();
    const fileLessSpecsSuite: TestSuiteInfo[] = [];

    tests.forEach(test => {
      if (test.type === TestType.Test) {
        // FIXME: Should never be true. Use type system to eliminate need for check
        this.logger.warn(
          () => `Got test with unknown top-level test suite: ${JSON.stringify(test, null, 2)} - Test will be ignored`
        );
        return;
      }
      if (!test.file) {
        this.logger.warn(() => `Got test with unknown file - Test Id is: ${test.id}`);
        this.logger.trace(() => `Test with unknown file: ${JSON.stringify(test)}`);

        fileLessSpecsSuite.push(test);
        return;
      }
      let testFileSuite: TestFileSuiteInfo | undefined = testFileSuitesByFilePath.get(test.file);

      if (!testFileSuite) {
        testFileSuite = this.createTestFileSuite(basePath, test.file);
        testFileSuitesByFilePath.set(test.file, testFileSuite);
      }
      testFileSuite.children.push(test);
    });

    const rootFolderSuite: TestFolderSuiteInfo = this.createFolderSuite(basePath);
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
        message: 'Could not determine the file for this test suite'
      };
      rootFolderSuite.children.push(fileLessTestFileSuite);
    });

    this.logger.debug(() => `Rearranged ${testFileSuitesByFilePath.size} test files into folders`);

    const topLevelFolderSuite: TestFolderSuiteInfo = this.flattenSingChildPaths(rootFolderSuite, groupingOptions);

    const rootSuiteChildren =
      topLevelFolderSuite === rootFolderSuite ? topLevelFolderSuite.children : [topLevelFolderSuite];

    const folderGroupedRootSuite: TestSuiteInfo = { ...rootSuite, children: rootSuiteChildren };
    return folderGroupedRootSuite;
  }

  private flattenSingChildPaths(
    suite: TestFolderSuiteInfo,
    flattenOptions: TestSuiteFolderGroupingOptions
  ): TestFolderSuiteInfo {
    if (!flattenOptions.flattenSingleChildFolders && !flattenOptions.flattenSingleSuiteFiles) {
      return suite;
    }

    suite.children = suite.children.map(childSuite => {
      if (childSuite.suiteType === TestSuiteType.Folder) {
        return this.flattenSingChildPaths(childSuite, flattenOptions);
      } else if (childSuite.suiteType === TestSuiteType.File && flattenOptions.flattenSingleSuiteFiles) {
        const singleChild = childSuite.children.length === 1 ? childSuite.children[0] : undefined;

        return singleChild?.type === TestType.Suite
          ? { ...singleChild, suiteType: TestSuiteType.File, file: singleChild.file! }
          : childSuite;
      }
      return childSuite;
    });

    const singleChild = suite.children.length === 1 ? suite.children[0] : undefined;

    const flattenedTestSuite =
      flattenOptions.flattenSingleChildFolders && singleChild?.suiteType === TestSuiteType.Folder
        ? { ...singleChild, label: posix.join(suite.label, singleChild.label) }
        : suite;

    return flattenedTestSuite;
  }

  private sortTestTree(test: TestSuiteInfo | TestFileSuiteInfo | TestFolderSuiteInfo) {
    const testComparator = this.compareTests.bind(this);
    test.children.sort(testComparator);

    test.children.forEach(childTest => {
      if (childTest.type === TestType.Suite) {
        this.sortTestTree(childTest);
      }
    });
  }

  private compareTests(test1: AnyTestInfo, test2: AnyTestInfo): number {
    const computeSuiteRank = (test: AnyTestInfo): number =>
      'suiteType' in test && test.suiteType === TestSuiteType.Folder
        ? 0
        : 'suiteType' in test && test.suiteType === TestSuiteType.File && !test.fullName
        ? 1
        : 2;

    const suite1Rank = computeSuiteRank(test1);
    const suite2Rank = computeSuiteRank(test2);

    return suite1Rank !== suite2Rank
      ? suite1Rank - suite2Rank
      : test1.file && test1.file === test2.file && test1.line !== undefined && test2.line !== undefined
      ? test1.line - test2.line
      : test1.label.toLocaleLowerCase() < test2.label.toLocaleLowerCase()
      ? -1
      : 1;
  }

  private createFolderSuite(absolutePath: string): TestFolderSuiteInfo {
    const folderPath = normalize(absolutePath);
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

  private createTestFileSuite(basePath: string, absoluteFilePath: string): TestFileSuiteInfo {
    const relativeFilePath = relative(basePath, absoluteFilePath);
    const fileSuiteId = `${absoluteFilePath}:`;

    const fileSuiteLabel = basename(absoluteFilePath).replace(/^(test[_\.-])?([^\.]*)([_\.-]test)?(\..*)$/i, '$2');

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

  private getDescendantFolderSuite(
    baseFolderNode: TestFolderSuiteInfo,
    folderAbsolutePath: string
  ): TestFolderSuiteInfo {
    if (baseFolderNode.path === folderAbsolutePath) {
      return baseFolderNode;
    }
    const basePath = baseFolderNode.path;
    const relativePathFromBase = relative(basePath, folderAbsolutePath);
    const pathSegments = relativePathFromBase.split(pathSeparator);
    const currentFolderPathSegments = [] as string[];
    let currentFolderNode: TestFolderSuiteInfo = baseFolderNode;

    for (const folderName of pathSegments) {
      currentFolderPathSegments.push(folderName);
      const currentFolderPath = resolve(basePath, ...currentFolderPathSegments);

      let nextFolderNode =
        currentFolderNode.path === currentFolderPath
          ? currentFolderNode
          : (currentFolderNode.children.find(child => {
              return child.suiteType === TestSuiteType.Folder && child.path === currentFolderPath;
            }) as TestFolderSuiteInfo | undefined);

      if (!nextFolderNode) {
        nextFolderNode = this.createFolderSuite(currentFolderPath);
        currentFolderNode.children.push(nextFolderNode);
      }
      currentFolderNode = nextFolderNode;
    }
    return currentFolderNode;
  }

  private isChildPath(parentPath: string, childPath: string): boolean {
    const childFromParentRelativePath = relative(parentPath, childPath);

    return (
      childPath !== parentPath &&
      !isAbsolute(childFromParentRelativePath) &&
      !childFromParentRelativePath.startsWith('..')
    );
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
