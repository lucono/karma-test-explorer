import { KarmaEventListener } from "../frameworks/karma/runner/karma-event-listener";
import { SpecResponseToTestSuiteInfoMapper } from "../frameworks/karma/runner/spec-response-to-test-suite-info-mapper";
import { Disposable } from "./disposable";
import { TestRunExecutor } from "./test-run-executor";
import { TestRunner } from "./test-runner";

export interface TestRunnerFactory extends Disposable {
    
  createTestRunner(
    karmaEventListener: KarmaEventListener,
    specToTestSuiteMapper: SpecResponseToTestSuiteInfoMapper,
    testRunExecutor?: TestRunExecutor): TestRunner;

  createTestRunExecutor(): TestRunExecutor;
}