import { TestInfo, TestSuiteInfo } from "vscode-test-adapter-api";
import { ExtensionConfig } from "../core/extension-config";
import { Disposable } from "./disposable";
import { TestResults } from "./test-status";

export interface TestManager extends Disposable {
    
  restart(config: ExtensionConfig): Promise<void>;

  loadTests(config: ExtensionConfig): Promise<TestSuiteInfo>;

  runTests(config: ExtensionConfig, tests: (TestInfo | TestSuiteInfo)[]): Promise<TestResults>;

  stopCurrentRun(): Promise<void>;

  isTestRunning(): boolean;
}