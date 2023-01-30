import { TestFactory } from '../api/test-factory.js';
import { TestRunExecutor } from '../api/test-run-executor.js';
import { TestRunner } from '../api/test-runner.js';
import { TestServerExecutor } from '../api/test-server-executor.js';
import { TestServer } from '../api/test-server.js';
import { KarmaTestListener } from '../frameworks/karma/runner/karma-test-listener.js';
import { TestDiscoveryProcessor } from '../frameworks/karma/runner/test-discovery-processor.js';
import { Disposable } from '../util/disposable/disposable.js';
import { Disposer } from '../util/disposable/disposer.js';
import { Logger } from '../util/logging/logger.js';

export class CascadingTestFactory implements TestFactory {
  private readonly delegateTestFactories: (Partial<TestFactory> & Disposable)[];
  private readonly disposables: Disposable[] = [];

  public constructor(delegateTestFactories: (Partial<TestFactory> & Disposable)[], private readonly logger: Logger) {
    this.delegateTestFactories = [...delegateTestFactories].reverse();
    this.disposables.push(...delegateTestFactories, logger);
  }

  public createTestServer(testServerExecutor?: TestServerExecutor): TestServer {
    const delegateFactory = this.delegateTestFactories.find(factory => 'createTestServer' in factory);

    if (!delegateFactory) {
      const errorMsg = 'There are no delegate test factories able to fulfil requested action: Create Test Server';
      this.logger.error(() => errorMsg);
      throw new Error(errorMsg);
    }
    return delegateFactory.createTestServer!(testServerExecutor ?? this.createTestServerExecutor());
  }

  public createTestRunner(
    karmaEventListener: KarmaTestListener,
    testDiscoveryProcessor: TestDiscoveryProcessor,
    testRunExecutor?: TestRunExecutor
  ): TestRunner {
    const delegateFactory = this.delegateTestFactories.find(factory => 'createTestRunner' in factory);

    if (!delegateFactory) {
      const errorMsg = 'There are no delegate test factories able to fulfil requested action: Create Test Runner';
      this.logger.error(() => errorMsg);
      throw new Error(errorMsg);
    }
    return delegateFactory.createTestRunner!(
      karmaEventListener,
      testDiscoveryProcessor,
      testRunExecutor ?? this.createTestRunExecutor()
    );
  }

  public createTestServerExecutor(): TestServerExecutor {
    const delegateFactory = this.delegateTestFactories.find(factory => 'createTestServerExecutor' in factory);

    if (!delegateFactory) {
      const errorMsg =
        'There are no delegate test factories able to fulfil requested action: Create Test Server Executor';
      this.logger.error(() => errorMsg);
      throw new Error(errorMsg);
    }
    return delegateFactory.createTestServerExecutor!();
  }

  public createTestRunExecutor(): TestRunExecutor {
    const delegateFactory = this.delegateTestFactories.find(factory => 'createTestRunExecutor' in factory);

    if (!delegateFactory) {
      const errorMsg = 'There are no delegate test factories able to fulfil requested action: Create Test Run Executor';
      this.logger.error(() => errorMsg);
      throw new Error(errorMsg);
    }
    return delegateFactory.createTestRunExecutor!();
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
