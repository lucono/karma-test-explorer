import { TestInfo, TestSuiteInfo } from 'vscode-test-adapter-api';

import { Disposable } from '../util/disposable/disposable.js';

export interface ServerStartInfo {
  karmaPort: number;
  karmaSocketPort: number;
  debugPort?: number;
}

export interface TestManager extends Disposable {
  start(): Promise<ServerStartInfo>;

  stop(): Promise<void>;

  restart(): Promise<void>;

  isStarted(): boolean;

  discoverTests(): Promise<TestSuiteInfo>;

  runTests(tests: (TestInfo | TestSuiteInfo)[]): Promise<void>;

  isActionRunning(): boolean;
}
