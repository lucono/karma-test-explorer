import { TestInfo, TestSuiteInfo } from "vscode-test-adapter-api";
import { Disposable } from "./disposable";
// import { TestResults } from "./test-results";

export interface TestManager extends Disposable {
    
  restart(): Promise<void>;

  loadTests(): Promise<TestSuiteInfo>;

  runTests(tests: (TestInfo | TestSuiteInfo)[]): Promise<void>; // <TestResults>;

  stopCurrentRun(): Promise<void>;

  isTestRunning(): boolean;
}