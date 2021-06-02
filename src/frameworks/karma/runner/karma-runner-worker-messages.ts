import { TestInfo, TestSuiteInfo } from "vscode-test-adapter-api";
import { TestResults } from "../../../api/test-results";
import { LogLevel } from "../../../core/log-level";

// --- Request Types ---

export enum KarmaRunnerWorkerRequestType {
  LoadTests = 'loadTests',
  RunTests = 'runTests'
}

export interface KarmaRunnerWorkerLoadTestsRequest {
  type: KarmaRunnerWorkerRequestType.LoadTests
}

export interface KarmaRunnerWorkerRunTestsRequest {
  type: KarmaRunnerWorkerRequestType.RunTests,
  tests: (TestInfo | TestSuiteInfo)[]
}

// --- Response Types ---

export enum KarmaRunnerWorkerResponseType {
  LoadTests = 'loadTests',
  RunTests = 'runTests',
  LogMessage = 'logMessage'
}

export interface KarmaRunnerWorkerLoadTestsResponse {
  type: KarmaRunnerWorkerResponseType.LoadTests,
  loadedTests: TestSuiteInfo
}

export interface KarmaRunnerWorkerRunTestsResponse {
  type: KarmaRunnerWorkerResponseType.RunTests,
  testResults: TestResults
}

export interface KarmaRunnerWorkerLogResponse {
  type: KarmaRunnerWorkerResponseType.LogMessage,
  logLevel: LogLevel,
  message: string
}

export type KarmaRunnerWorkerTestRequest = KarmaRunnerWorkerLoadTestsRequest | KarmaRunnerWorkerRunTestsRequest;