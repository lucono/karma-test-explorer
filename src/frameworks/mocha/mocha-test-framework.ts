import { TestFramework, TestInterface, TestSet } from '../../api/test-framework';
import { escapeForRegExp } from '../../util/utils';

const ALL_TESTS_PATTERN = '';

const bddTestInterface: TestInterface = {
	suite: ['describe', 'describe.only', 'describe.skip'],
	test: ['it', 'it.only', 'it.skip']
};

const tddTestInterface: TestInterface = {
	suite: ['suite', 'suite.only', 'suite.skip'],
	test: ['test', 'test.only', 'test.skip']
};

export enum MochaInterfaceStyle {
	BDD = 'bdd',
	TDD = 'tdd'
}

export class MochaTestFramework implements TestFramework {
	public constructor(private readonly interfaceStyle: MochaInterfaceStyle) {}

	public getTestInterface(): TestInterface {
		return this.interfaceStyle === MochaInterfaceStyle.BDD ? bddTestInterface : tddTestInterface;
	}

	public getTestSelector(testSet: TestSet): string {
		const testSuitePatterns: string[] = testSet.testSuites.map(testFullName => `^${escapeForRegExp(testFullName)} `);
		const testPatterns: string[] = testSet.tests.map(testFullName => `^${escapeForRegExp(testFullName)}$`);

		const testSelectorPatterns = [...testSuitePatterns, ...testPatterns];
		const aggregateTestPattern = `(${testSelectorPatterns.join('|')})`;

		return aggregateTestPattern;
	}

	public getAllTestsSelector(): string {
		return `${ALL_TESTS_PATTERN}`;
	}

	public getTestDiscoverySelector(): string {
		return `${ALL_TESTS_PATTERN}`;
	}
}
