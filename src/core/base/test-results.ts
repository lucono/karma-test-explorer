import { TestSuiteInfo } from 'vscode-test-adapter-api';

import { TestStatus } from './test-status.js';

export type TestResults = Record<TestStatus, TestSuiteInfo>;
