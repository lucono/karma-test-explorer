import { TestInfo, TestSuiteInfo } from "vscode-test-adapter-api";
import { Disposable } from "./disposable";
import { TestResults } from "./test-status";

export interface TestManager extends Disposable {
    
  restart(): Promise<void>;

  loadTests(): Promise<TestSuiteInfo>;

  runTests(tests: (TestInfo | TestSuiteInfo)[]): Promise<TestResults>;

  stopCurrentRun(): Promise<void>;

  isTestRunning(): boolean;
}