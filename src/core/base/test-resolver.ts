import { TestInfo, TestSuiteInfo } from 'vscode-test-adapter-api';

export interface TestResolver {
  resolveTest(testId: string): TestInfo | undefined;

  resolveTestSuite(testSuiteId: string): TestSuiteInfo | undefined;

  resolveRootSuite(): TestSuiteInfo | undefined;
}
