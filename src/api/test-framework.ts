export interface TestFramework {
	getTestInterface(): TestInterface;
}

export interface TestInterface {
	suite: string[];
	test: string[];
}
