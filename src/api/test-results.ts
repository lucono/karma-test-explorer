import { TestSuiteInfo } from 'vscode-test-adapter-api';
import { TestStatus } from './test-status';

export type TestResults = Record<TestStatus, TestSuiteInfo>;
