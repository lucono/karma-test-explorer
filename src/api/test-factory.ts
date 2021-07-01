import { KarmaTestEventListener } from '../frameworks/karma/runner/karma-test-event-listener';
import { TestLoadProcessor } from '../frameworks/karma/runner/test-load-processor';
import { Disposable } from './disposable';
import { TestRunExecutor } from './test-run-executor';
import { TestRunner } from './test-runner';
import { TestServer } from './test-server';
import { TestServerExecutor } from './test-server-executor';

export interface TestFactory extends Disposable {
	createTestServer(testServerExecutor?: TestServerExecutor): TestServer;

	createTestRunner(
		karmaEventListener: KarmaTestEventListener,
		testLoadProcessor: TestLoadProcessor,
		testRunExecutor?: TestRunExecutor
	): TestRunner;

	createTestServerExecutor(): TestServerExecutor;

	createTestRunExecutor(): TestRunExecutor;
}
