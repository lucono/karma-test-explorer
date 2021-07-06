import { TestFramework, TestInterface } from '../../api/test-framework';

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
}
