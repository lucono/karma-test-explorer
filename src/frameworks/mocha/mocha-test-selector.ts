import { TestSelector, TestSet } from '../../core/base/test-framework.js';
import { escapeForRegExp } from '../../util/utils.js';

const ALL_TESTS_PATTERN = '';

export class MochaTestSelector implements TestSelector {
  public testSet(testSet: TestSet): string {
    const testSuitePatterns: string[] = testSet.testSuites.map(testFullName => `^${escapeForRegExp(testFullName)} `);
    const testPatterns: string[] = testSet.tests.map(testFullName => `^${escapeForRegExp(testFullName)}$`);

    const testSelectorPatterns = [...testSuitePatterns, ...testPatterns];
    const aggregateTestPattern = `(${testSelectorPatterns.join('|')})`;

    return aggregateTestPattern;
  }

  public allTests(): string {
    return `${ALL_TESTS_PATTERN}`;
  }

  public testDiscovery(): string {
    return `${ALL_TESTS_PATTERN}`;
  }
}
