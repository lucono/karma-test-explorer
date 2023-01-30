import { KarmaTestListener } from '../frameworks/karma/runner/karma-test-listener.js';
import { TestDiscoveryProcessor } from '../frameworks/karma/runner/test-discovery-processor.js';
import { Disposable } from '../util/disposable/disposable.js';
import { TestRunExecutor } from './test-run-executor.js';
import { TestRunner } from './test-runner.js';
import { TestServerExecutor } from './test-server-executor.js';
import { TestServer } from './test-server.js';

export interface TestFactory extends Disposable {
  createTestServer(testServerExecutor?: TestServerExecutor): TestServer;

  createTestRunner(
    karmaEventListener: KarmaTestListener, // TODO: Create TestEventListener interface
    testDiscoveryProcessor: TestDiscoveryProcessor, // TODO: Create TestProcessor interface
    testRunExecutor?: TestRunExecutor
  ): TestRunner;

  createTestServerExecutor(): TestServerExecutor;

  createTestRunExecutor(): TestRunExecutor;
}
