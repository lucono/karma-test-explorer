import { TestFramework, TestInterface, TestSet } from '../../api/test-framework';
import { escapeForRegExp } from '../../util/utils';

const SKIP_ALL_TESTS_PATTERN = '$^';
const RUN_ALL_TESTS_PATTERN = '';

const testInterface: TestInterface = {
	suite: ['describe', 'xdescribe', 'fdescribe'],
	test: ['it', 'xit', 'fit']
};

export class JasmineTestFramework implements TestFramework {
	public getTestInterface(): TestInterface {
		return testInterface;
	}

	public getTestSelector(testSet: TestSet): string {
		const testSuitePatterns: string[] = testSet.testSuites.map(testFullName => `^${escapeForRegExp(testFullName)} `);
		const testPatterns: string[] = testSet.tests.map(testFullName => `^${escapeForRegExp(testFullName)}$`);

		const testSelectorPatterns = [...testSuitePatterns, ...testPatterns];
		const aggregateTestPattern = `/(${testSelectorPatterns.join('|')})/`;

		return aggregateTestPattern;
	}

	public getAllTestsSelector(): string {
		return `/${RUN_ALL_TESTS_PATTERN}/`;
	}

	public getTestDiscoverySelector(): string {
		return `/${SKIP_ALL_TESTS_PATTERN}/`;
	}
}
