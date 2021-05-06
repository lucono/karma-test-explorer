import { TestInfo, TestSuiteInfo } from "vscode-test-adapter-api";
import { PathFinder } from "../helpers/path-finder";

export interface TestRunner {

  loadTests(pathFinder: PathFinder, karmaPort: number): Promise<TestSuiteInfo>;

  runTests(tests: (TestInfo | TestSuiteInfo)[], karmaPort: number): Promise<void>;

}

// FIXME: Not currently used
export interface TestRunInfo {
  testRunId: string,
  tests: (TestInfo | TestSuiteInfo)[]
}
