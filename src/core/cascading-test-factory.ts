import { TestFactory } from "../api/test-factory";
import { TestRunExecutor } from "../api/test-run-executor";
import { TestRunner } from "../api/test-runner";
import { TestServer } from "../api/test-server";
import { TestServerExecutor } from "../api/test-server-executor";
import { KarmaEventListener } from "../frameworks/karma/runner/karma-event-listener";
import { SpecResponseToTestSuiteInfoMapper } from "../frameworks/karma/runner/spec-response-to-test-suite-info-mapper";
import { Logger } from "./logger";

export class CascadingTestFactory implements TestFactory {

  public constructor(
    private readonly delegateTestFactories: Partial<TestFactory>[],
    private readonly logger: Logger)
  {}

  public createTestServer(
    // serverShardIndex: number = 0,
    // totalServerShards: number = 1,
    testServerExecutor?: TestServerExecutor): TestServer {
    const delegateFactory = this.delegateTestFactories.find(factory => 'createTestServer' in factory);

    if (!delegateFactory) {
      throw new Error(
        `There are no delegate test factories able to fulfil ` +
        `requested action: Create Test Server`);
    }
    return delegateFactory.createTestServer!(testServerExecutor ?? this.createTestServerExecutor());
  }

  public createTestRunner(
    karmaEventListener: KarmaEventListener,
    specToTestSuiteMapper: SpecResponseToTestSuiteInfoMapper,
    testRunExecutor?: TestRunExecutor): TestRunner
  {
    const delegateFactory = this.delegateTestFactories.find(factory => 'createTestRunner' in factory);

    if (!delegateFactory) {
      throw new Error(
        `There are no delegate test factories able to fulfil ` +
        `requested action: Create Test Runner`);
    }
    return delegateFactory.createTestRunner!(
      karmaEventListener,
      specToTestSuiteMapper,
      testRunExecutor ?? this.createTestRunExecutor());
  }

  public createTestServerExecutor(
    serverShardIndex?: number,
    totalServerShards?: number): TestServerExecutor
  {
    const delegateFactory = this.delegateTestFactories.find(factory => 'createTestServerExecutor' in factory);

    if (!delegateFactory) {
      throw new Error(
        `There are no delegate test factories able to fulfil ` +
        `requested action: Create Test Server Executor`);
    }
    return delegateFactory.createTestServerExecutor!(serverShardIndex, totalServerShards);
  }

  public createTestRunExecutor(): TestRunExecutor {
    const delegateFactory = this.delegateTestFactories.find(factory => 'createTestRunExecutor' in factory);

    if (!delegateFactory) {
      throw new Error(
        `There are no delegate test factories able to fulfil ` +
        `requested action: Create Test Run Executor`);
    }
    return delegateFactory.createTestRunExecutor!();
  }
  
  public dispose(): void {
    this.logger.dispose();
  }
}