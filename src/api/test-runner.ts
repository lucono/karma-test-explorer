import { TestInfo, TestSuiteInfo } from "vscode-test-adapter-api";
import { TestResultAccumulator } from "../frameworks/karma/runner/test-result-accumulator";
import { Disposable } from "./disposable";

export interface TestRunner extends Disposable {

  loadTests(karmaPort: number): Promise<TestSuiteInfo>;

  runTests(
    karmaPort: number,
    tests: (TestInfo | TestSuiteInfo)[],
    testResultAccumulator: TestResultAccumulator): void;

}
