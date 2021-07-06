import { TestCapabilities, TestFramework, TestInterface, TestSelector } from '../../api/test-framework';
import { TestFrameworks } from '../../core/test-frameworks';
import { JasmineTestSelector } from './jasmine-test-selector';

const testInterface: TestInterface = {
	suite: ['describe', 'xdescribe', 'fdescribe'],
	test: ['it', 'xit', 'fit']
};

const testCapabilities: TestCapabilities = {
	autoWatch: true
};

export class JasmineTestFramework implements TestFramework {
	private testSelector: TestSelector;
	public readonly framework = TestFrameworks.Jasmine;

	public constructor() {
		this.testSelector = new JasmineTestSelector();
	}

	public getTestInterface(): TestInterface {
		return testInterface;
	}

	public getTestSelector(): TestSelector {
		return this.testSelector;
	}

	public getTestCapabilities(): TestCapabilities {
		return testCapabilities;
	}
}
