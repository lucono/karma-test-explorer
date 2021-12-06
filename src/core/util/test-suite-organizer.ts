import { basename, dirname, posix, relative, resolve, sep as pathSeparator } from 'path';
import { TestInfo, TestSuiteInfo } from 'vscode-test-adapter-api';
import { EXTENSION_CONFIG_PREFIX, EXTENSION_NAME } from '../../constants';
import { Disposable } from '../../util/disposable/disposable';
import { Disposer } from '../../util/disposable/disposer';
import { Logger } from '../../util/logging/logger';
import { isChildPath } from '../../util/utils';
import { TestGrouping } from '../base/test-grouping';
import { AnyTestInfo, TestFileSuiteInfo, TestFolderSuiteInfo, TestSuiteType, TestType } from '../base/test-infos';
import { ConfigSetting } from '../config/config-setting';
import { TestHelper } from '../test-helper';

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
  private readonly testsBasePath: string;
  private readonly disposables: Disposable[] = [];

  public constructor(
    private readonly rootPath: string,
    testsBasePath: string,
    private readonly testHelper: TestHelper,
    private readonly logger: Logger
  ) {
    this.testsBasePath = isChildPath(rootPath, testsBasePath) ? testsBasePath : rootPath;
    this.disposables.push(logger);
  }

  public organizeTests(tests: (TestInfo | TestSuiteInfo)[], options?: TestSuiteOrganizationOptions): TestSuiteInfo {
    const allOptions: Required<TestSuiteOrganizationOptions> = {
      ...defaultTestSuiteOrganizerOptions,
      ...options
    };

    const mappedTests: (TestInfo | TestSuiteInfo)[] = [];
    const unmappedTests: (TestInfo | TestSuiteInfo)[] = [];

    tests.forEach(test => {
      if (!test.file) {
        this.logger.warn(() => `Got test with unknown file - Test Id is: ${test.id}`);
        this.logger.trace(() => `Test with unknown file: ${JSON.stringify(test, null, 2)}`);

        unmappedTests.push(test);
        return;
      }
      mappedTests.push(test);
    });

    const groupedMappedTests: AnyTestInfo[] =
      allOptions.testGrouping === TestGrouping.Folder ? this.groupByFolder(mappedTests, allOptions) : mappedTests;

    this.sortTestTree(groupedMappedTests);

    const rootSuite = this.createRootSuite();
    rootSuite.children.push(...groupedMappedTests);

    if (unmappedTests.length > 0) {
      const filelessTestsSuiteMessage =
        `${EXTENSION_NAME} could not find the test sources in your project ` +
        `for the tests in this group. This can occur if the tests: \n\n` +
        `- Use parameterization \n` +
        `- Use computed test descriptions \n` +
        `- Are in test files not captured by your '${EXTENSION_CONFIG_PREFIX}.${ConfigSetting.TestFiles}' setting \n` +
        `- Were otherwise not successfully discovered by ${EXTENSION_NAME}` +
        `\n\n` +
        `To exclude unmapped tests from being displayed, set the ` +
        `'${EXTENSION_CONFIG_PREFIX}.${ConfigSetting.ShowUnmappedTests}' setting to false.`;

      const unmappedTestsSuite: TestSuiteInfo = {
        id: '*',
        name: '',
        fullName: '', // To prevent being runnable with grep pattern of fullName
        label: this.testHelper.getTestLabel('Unmapped Tests'),
        type: TestType.Suite,
        activeState: 'default',
        message: filelessTestsSuiteMessage,
        testCount: 0,
        children: unmappedTests
      };

      rootSuite.children.push(unmappedTestsSuite);
    }

    return rootSuite;
  }

  private groupByFolder(
    tests: (TestInfo | TestSuiteInfo)[],
    groupingOptions: TestSuiteFolderGroupingOptions
  ): (TestFileSuiteInfo | TestFolderSuiteInfo)[] {
    const testFileSuitesByFilePath: Map<string, TestFileSuiteInfo> = new Map();

    tests.forEach(test => {
      if (!test.file) {
        this.logger.warn(
          () =>
            `Encountered unexpected test with unknown file in ` +
            `pre-filtered test list for folder grouping operation - ` +
            `Test Id is: ${test.id}`
        );
        this.logger.trace(() => `Test with unknown file: ${JSON.stringify(test, null, 2)}`);
        return;
      }
      let testFileSuite: TestFileSuiteInfo | undefined = testFileSuitesByFilePath.get(test.file);

      if (!testFileSuite) {
        testFileSuite = this.createTestFileSuite(test.file);
        testFileSuitesByFilePath.set(test.file, testFileSuite);
      }
      testFileSuite.children.push(test);
    });

    const rootFolderSuite: TestFolderSuiteInfo = this.createFolderSuite(this.testsBasePath);
    rootFolderSuite.name = '.';
    rootFolderSuite.label = '.';

    testFileSuitesByFilePath.forEach(testFileSuite => {
      const testSuiteFolderPath = dirname(testFileSuite.file);
      const specFolderSuite = this.getDescendantFolderSuite(rootFolderSuite, testSuiteFolderPath);
      specFolderSuite.children.push(testFileSuite);
    });

    this.logger.debug(() => `Rearranged ${testFileSuitesByFilePath.size} test files into folders`);

    const topLevelFolderSuite: TestFolderSuiteInfo = this.flattenSingChildPaths(rootFolderSuite, groupingOptions);

    const rootSuiteChildren =
      topLevelFolderSuite === rootFolderSuite ? topLevelFolderSuite.children : [topLevelFolderSuite];

    return rootSuiteChildren;
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

    let flattenedTestSuite: TestFolderSuiteInfo = suite;

    if (flattenOptions.flattenSingleChildFolders && singleChild?.suiteType === TestSuiteType.Folder) {
      const flattenedSuiteName = posix.join(suite.name, singleChild.name);
      flattenedTestSuite = { ...singleChild, name: flattenedSuiteName, label: flattenedSuiteName };
    }

    return flattenedTestSuite;
  }

  private createRootSuite(): TestSuiteInfo {
    const rootSuite: TestSuiteInfo = {
      type: TestType.Suite,
      id: ':',
      activeState: 'default',
      label: 'Karma tests',
      name: '',
      fullName: '', // To prevent being runnable with grep pattern of fullName
      children: [],
      testCount: 0
    };
    return rootSuite;
  }

  private sortTestTree(tests: AnyTestInfo[]) {
    const testComparator = this.compareTests.bind(this);
    tests.sort(testComparator);

    tests.forEach(childTest => {
      if (childTest.type === TestType.Suite) {
        this.sortTestTree(childTest.children);
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
      : test1.name.toLocaleLowerCase() < test2.name.toLocaleLowerCase()
      ? -1
      : 1;
  }

  private createFolderSuite(absolutePath: string): TestFolderSuiteInfo {
    const relativePath = relative(this.rootPath, absolutePath);
    const folderName = basename(absolutePath);

    return {
      type: TestType.Suite,
      suiteType: TestSuiteType.Folder,
      activeState: 'default',
      path: absolutePath,
      id: absolutePath,
      label: folderName,
      name: folderName,
      fullName: '', // To prevent being runnable with grep pattern of fullName
      tooltip: relativePath ?? absolutePath,
      children: [],
      testCount: 0
    };
  }

  private createTestFileSuite(absoluteFilePath: string): TestFileSuiteInfo {
    const relativeFilePath = relative(this.testsBasePath, absoluteFilePath);
    const fileSuiteId = `${absoluteFilePath}:`;
    const fileSuiteLabel = basename(absoluteFilePath).replace(/^(test[_\.-])?([^\.]*)([_\.-]test)?(\..*)$/i, '$2');

    return {
      type: TestType.Suite,
      suiteType: TestSuiteType.File,
      activeState: 'default',
      file: absoluteFilePath,
      line: 0,
      id: fileSuiteId,
      label: fileSuiteLabel,
      name: fileSuiteLabel,
      fullName: '', // To prevent being runnable with grep pattern of fullName
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

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
