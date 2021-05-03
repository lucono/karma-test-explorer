import { TestInfo, TestSuiteInfo } from "vscode-test-adapter-api";
import { PathFinder } from "../helpers/path-finder";

export interface TestRunner {

  loadTests(pathFinder: PathFinder, karmaPort: number): Promise<TestSuiteInfo>;

  runTests(tests: Array<TestInfo | TestSuiteInfo>, karmaPort: number): Promise<void>;

}
