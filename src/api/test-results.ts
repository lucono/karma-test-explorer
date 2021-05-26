import { TestSuiteInfo } from "vscode-test-adapter-api";
import { TestStatus } from "./test-status";

// export type TestResults = { [key in TestStatus]: TestSuiteInfo };
export type TestResults = Record<TestStatus, TestSuiteInfo>;
