import { TestFrameworks } from '../core/test-frameworks';

export interface TestInterface {
	suite: string[];
	test: string[];
}

export interface TestSet {
	testSuites: string[];
	tests: string[];
}

export interface TestSelector {
	testSet(testSet: TestSet): string;

	allTests(): string;

	testDiscovery(): string;
}

export interface TestCapabilities {
	autoWatch?: boolean;
}

export interface TestFramework {
	readonly framework: TestFrameworks;

	getTestInterface(): TestInterface;

	getTestSelector(): TestSelector;

	getTestCapabilities(): TestCapabilities;
}
