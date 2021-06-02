import { TestRunExecutor } from "../api/test-run-executor";
import { TestRunner } from "../api/test-runner";
import { TestRunnerFactory } from "../api/test-runner-factory";
import { KarmaEventListener } from "../frameworks/karma/runner/karma-event-listener";
import { SpecResponseToTestSuiteInfoMapper } from "../frameworks/karma/runner/spec-response-to-test-suite-info-mapper";
import { Logger } from "./logger";

export class CascadingTestRunnerFactory implements TestRunnerFactory {

  public constructor(
    private readonly delegateTestFactories: Partial<TestRunnerFactory>[],
    private readonly logger: Logger)
  {}

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