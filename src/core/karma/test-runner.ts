import { TestInfo, TestSuiteInfo } from "vscode-test-adapter-api";
import { SpecLocator } from "../helpers/spec-locator";

export interface TestRunner {

  loadTests(specLocator: SpecLocator, karmaPort: number): Promise<TestSuiteInfo>;

  runTests(tests: (TestInfo | TestSuiteInfo)[], karmaPort: number): Promise<void>;

}

// FIXME: Not currently used
export interface TestRunInfo {
  testRunId: string,
  tests: (TestInfo | TestSuiteInfo)[]
}
