import { KarmaEventListener } from "../frameworks/karma/integration/karma-event-listener";
import { SpecResponseToTestSuiteInfoMapper } from "../frameworks/karma/integration/spec-response-to-test-suite-info-mapper";
import { Disposable } from "./disposable";
import { TestRunExecutor } from "./test-run-executor";
import { TestRunner } from "./test-runner";
import { TestServer } from "./test-server";
import { TestServerExecutor } from "./test-server-executor";

export interface TestFactory extends Disposable {
    
  createTestServer(testServerExecutor: TestServerExecutor): TestServer;
  
  createTestRunner(
    testRunExecutor: TestRunExecutor,
    karmaEventListener: KarmaEventListener,
    specToTestSuiteMapper: SpecResponseToTestSuiteInfoMapper): TestRunner;

  createTestServerExecutor(serverShardIndex?: number, totalServerShards?: number): TestServerExecutor;

  createTestRunExecutor(): TestRunExecutor;
}