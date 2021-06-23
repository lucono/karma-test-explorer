import { TestInfo, TestSuiteInfo } from "vscode-test-adapter-api";
import { Disposable } from "./disposable";
// import { TestResults } from "./test-results";
// import { TestStatus } from "./test-status";

// interface TestResult {
//   test: TestInfo,
//   status: TestStatus,
//   timeTaken: number,
//   message: string,
//   decorations: TestDecoration[]
// }
// interface TestListener {
//   testLoadStarted(): void;
//   testLoadFinished(testSuite: TestSuiteInfo): void;
//   testRunStarted(testIds: string[]): void;
//   testCompleted(testResult: TestResult): void;
//   testRunFinished(testResults: TestResults): void;
// }

// interface TestManager2 extends Disposable {
//   addTestListener(testListener: TestListener): void;
//   loadTests(): Promise<void>;
//   runTests(testIds: string[]): Promise<void>;
//   stopCurrentRun(): Promise<void>;
//   isTestRunning(): boolean;
//   restart(): Promise<void>;
// }

export interface TestManager extends Disposable {
    
  restart(): Promise<void>;

  loadTests(): Promise<TestSuiteInfo>;

  runTests(tests: (TestInfo | TestSuiteInfo)[]): Promise<void>; // <TestResults>;

  stopCurrentRun(): Promise<void>;

  isTestRunning(): boolean;
}