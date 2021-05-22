import { TestInfo, TestSuiteInfo } from "vscode-test-adapter-api";
import { TestResults } from "./test-result";

export interface TestRunner {

  loadTests(karmaPort: number): Promise<TestSuiteInfo>;

  runTests(karmaPort: number, tests: (TestInfo | TestSuiteInfo)[]): Promise<TestResults>;

}
