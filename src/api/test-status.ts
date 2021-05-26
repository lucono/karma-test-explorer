import { TestSuiteInfo } from "vscode-test-adapter-api";

export enum TestStatus {
  Failed = "Failed",
  Skipped = "Skipped",
  Success = "Success",
}

// export type TestResults = { [key in TestStatus]: TestSuiteInfo };
export type TestResults = Record<TestStatus, TestSuiteInfo>;
