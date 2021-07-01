import { TestInfo, TestSuiteInfo } from 'vscode-test-adapter-api';
import { Disposable } from './disposable';

export interface TestRunner extends Disposable {
	loadTests(karmaPort: number): Promise<TestSuiteInfo>;

	runTests(karmaPort: number, tests: (TestInfo | TestSuiteInfo)[]): Promise<void>;
}
