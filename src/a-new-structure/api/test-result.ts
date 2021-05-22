import { TestSuiteInfo } from "vscode-test-adapter-api";

export enum TestResult {
  Failed = "Failed",
  Skipped = "Skipped",
  Success = "Success",
}

export type TestResults = { [key in TestResult]: TestSuiteInfo };
