import { TestInfo, TestSuiteInfo } from "vscode-test-adapter-api";

export interface TestRunner {

  loadTests(karmaPort: number): Promise<TestSuiteInfo>;

  runTests(tests: (TestInfo | TestSuiteInfo)[], karmaPort: number): Promise<void>;

}

// FIXME: Not currently used
export interface TestRunInfo {
  testRunId: string,
  tests: (TestInfo | TestSuiteInfo)[]
}
