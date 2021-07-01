import { TestInfo, TestSuiteInfo } from 'vscode-test-adapter-api';
import { Disposable } from './disposable';

export interface TestManager extends Disposable {
	restart(): Promise<void>;

	loadTests(): Promise<TestSuiteInfo>;

	runTests(tests: (TestInfo | TestSuiteInfo)[]): Promise<void>;

	stopCurrentRun(): Promise<void>;

	isTestRunning(): boolean;
}
