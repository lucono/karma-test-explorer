import { TestInfo, TestSuiteInfo } from 'vscode-test-adapter-api';
import { Disposable } from '../util/disposable/disposable';
import { Disposer } from '../util/disposable/disposer';
import { Logger } from '../util/logging/logger';
import { TestType } from './base/test-infos';

export interface StoredTestResolver {
  resolveTest(testId: string): TestInfo | undefined;
  resolveTestSuite(testSuiteId: string): TestSuiteInfo | undefined;
  resolveRootSuite(): TestSuiteInfo | undefined;
}

export class TestStore implements Disposable {
  private rootTest?: TestSuiteInfo;
  private storedTestsById: Map<string, TestInfo | TestSuiteInfo> = new Map();
  private readonly testResolver: StoredTestResolver;
  private readonly disposables: Disposable[] = [];

  public constructor(private logger: Logger) {
    this.testResolver = {
      resolveRootSuite: this.getRootSuite.bind(this),
      resolveTest: this.getTestById.bind(this),
      resolveTestSuite: this.getTestSuiteById.bind(this)
    };
    this.disposables.push(logger);
  }

  public storeRootSuite(rootTest: TestSuiteInfo) {
    this.clear();
    this.logger.debug(() => 'Updating stored tests');

    const testsById: Map<string, TestInfo | TestSuiteInfo> = new Map();

    const processTestTree = (test: TestInfo | TestSuiteInfo): void => {
      testsById.set(test.id, test);
      if (test.type === TestType.Suite && test.children?.length) {
        test.children.forEach(childTest => processTestTree(childTest));
      }
    };

    processTestTree(rootTest);
    this.rootTest = rootTest;
    this.storedTestsById = testsById;
  }

  public getRootSuite(): TestSuiteInfo | undefined {
    return this.rootTest;
  }

  public getTestsByFile(filePath: string): TestInfo[] {
    const changedTests = [...this.storedTestsById.values()].filter(
      loadedTest => loadedTest.file === filePath && loadedTest.type === TestType.Test
    ) as TestInfo[];

    return changedTests;
  }

  public getTestById(testId: string): TestInfo | undefined {
    const test = this.storedTestsById.get(testId);
    return test?.type === TestType.Test ? test : undefined;
  }

  public getTestSuiteById(testSuiteId: string): TestSuiteInfo | undefined {
    const testSuite = this.storedTestsById.get(testSuiteId);
    return testSuite?.type === TestType.Suite ? testSuite : undefined;
  }

  public getTestsOrSuitesById(testIds: string[]): (TestInfo | TestSuiteInfo)[] {
    const tests = testIds.map(testId => this.storedTestsById.get(testId)).filter(test => test !== undefined) as (
      | TestInfo
      | TestSuiteInfo
    )[];
    return tests;
  }

  public getTestResolver(): StoredTestResolver {
    return this.testResolver;
  }

  public clear(): void {
    this.logger.debug(() => 'Clearing stored tests');
    this.rootTest = undefined;
    this.storedTestsById.clear();
  }

  public async dispose(): Promise<void> {
    await Disposer.dispose(this.disposables);
  }
}
