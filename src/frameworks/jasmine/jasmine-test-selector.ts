import { TestSelector, TestSet } from '../../core/base/test-framework.js';
import { escapeForRegExp } from '../../util/utils.js';

const SKIP_ALL_TESTS_PATTERN = '$^';
const RUN_ALL_TESTS_PATTERN = '';

export class JasmineTestSelector implements TestSelector {
  public testSet(testSet: TestSet): string {
    const testSuitePatterns: string[] = testSet.testSuites.map(testFullName => `^${escapeForRegExp(testFullName)} `);
    const testPatterns: string[] = testSet.tests.map(testFullName => `^${escapeForRegExp(testFullName)}$`);

    const testSelectorPatterns = [...testSuitePatterns, ...testPatterns];
    const aggregateTestPattern = `/(${testSelectorPatterns.join('|')})/`;

    return aggregateTestPattern;
  }

  public allTests(): string {
    return `/${RUN_ALL_TESTS_PATTERN}/`;
  }

  public testDiscovery(): string {
    return `/${SKIP_ALL_TESTS_PATTERN}/`;
  }
}
