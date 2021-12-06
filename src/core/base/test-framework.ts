import { TestFrameworkName } from './test-framework-name';

export interface TestInterface {
  suiteTags: { default: string[]; focused: string[]; disabled: string[] };
  testTags: { default: string[]; focused: string[]; disabled: string[] };
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
  watchModeSupport?: boolean;
}

export interface TestFramework {
  readonly name: TestFrameworkName;

  getTestInterface(): TestInterface;

  getTestSelector(): TestSelector;

  getTestCapabilities(): TestCapabilities;
}
