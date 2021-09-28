import { KarmaTestEventListener } from '../frameworks/karma/runner/karma-test-event-listener';
import { TestDiscoveryProcessor } from '../frameworks/karma/runner/test-discovery-processor';
import { Disposable } from '../util/disposable/disposable';
import { TestRunExecutor } from './test-run-executor';
import { TestRunner } from './test-runner';
import { TestServer } from './test-server';
import { TestServerExecutor } from './test-server-executor';

export interface TestFactory extends Disposable {
  createTestServer(testServerExecutor?: TestServerExecutor): TestServer;

  createTestRunner(
    karmaEventListener: KarmaTestEventListener, // TODO: Create TestEventListener interface
    testDiscoveryProcessor: TestDiscoveryProcessor, // TODO: Create TestProcessor interface
    testRunExecutor?: TestRunExecutor
  ): TestRunner;

  createTestServerExecutor(): TestServerExecutor;

  createTestRunExecutor(): TestRunExecutor;
}
