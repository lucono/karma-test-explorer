import { TestInfo, TestSuiteInfo } from "vscode-test-adapter-api";
import { TestResults } from "../frameworks/karma/karma-test-runner";

export interface TestRunner {

  loadTests(karmaPort: number): Promise<TestSuiteInfo>;

  runTests(karmaPort: number, tests: (TestInfo | TestSuiteInfo)[]): Promise<TestResults>;

}
