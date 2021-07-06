import { TestFramework, TestInterface } from '../../api/test-framework';

const testInterface: TestInterface = {
	suite: ['describe', 'xdescribe', 'fdescribe'],
	test: ['it', 'xit', 'fit']
};

export class JasmineTestFramework implements TestFramework {
	public getTestInterface(): TestInterface {
		return testInterface;
	}
}
