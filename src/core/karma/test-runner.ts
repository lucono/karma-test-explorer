import { TestInfo, TestSuiteInfo } from "vscode-test-adapter-api";
import { TestExplorerConfiguration } from "../../model/test-explorer-configuration";
import { TestResults } from "./karma-test-runner";

export interface TestRunner {

  loadTests(karmaPort: number, testExplorerConfig: TestExplorerConfiguration): Promise<TestSuiteInfo>;

  runTests(tests: (TestInfo | TestSuiteInfo)[], karmaPort: number, testExplorerConfig: TestExplorerConfiguration): Promise<TestResults>;

}
