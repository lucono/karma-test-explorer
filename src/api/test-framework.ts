export interface TestInterface {
	suite: string[];
	test: string[];
}

export interface TestSet {
	testSuites: string[];
	tests: string[];
}

export interface TestFramework {
	getTestInterface(): TestInterface;

	getTestSelector(testSet: TestSet): string;

	getAllTestsSelector(): string;

	getTestDiscoverySelector(): string;
}
