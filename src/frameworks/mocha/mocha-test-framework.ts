import { TestCapabilities, TestFramework, TestInterface, TestSelector } from '../../api/test-framework';
import { TestFrameworks } from '../../core/test-frameworks';
import { MochaTestSelector } from './mocha-test-selector';

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

const testCapabilities: TestCapabilities = {
	autoWatch: false
};

export class MochaTestFramework implements TestFramework {
	private readonly testSelector: TestSelector;
	public readonly framework;

	public constructor(private readonly interfaceStyle: MochaInterfaceStyle) {
		this.testSelector = new MochaTestSelector();
		this.framework = interfaceStyle === MochaInterfaceStyle.BDD ? TestFrameworks.MochaBDD : TestFrameworks.MochaTDD;
	}

	public getTestInterface(): TestInterface {
		return this.interfaceStyle === MochaInterfaceStyle.BDD ? bddTestInterface : tddTestInterface;
	}

	public getTestSelector(): TestSelector {
		return this.testSelector;
	}

	public getTestCapabilities(): TestCapabilities {
		return testCapabilities;
	}
}
