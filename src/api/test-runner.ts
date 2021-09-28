import { TestInfo, TestSuiteInfo } from 'vscode-test-adapter-api';
import { Disposable } from '../util/disposable/disposable';

export interface TestRunner extends Disposable {
  discoverTests(karmaPort: number): Promise<TestSuiteInfo>;

  runTests(karmaPort: number, tests: (TestInfo | TestSuiteInfo)[]): Promise<void>;
}
