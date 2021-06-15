import { KarmaEventListener } from "../frameworks/karma/runner/karma-event-listener";
import { SpecResponseToTestSuiteInfoMapper } from "../frameworks/karma/runner/spec-response-to-test-suite-info-mapper";
import { Disposable } from "./disposable";
import { TestRunExecutor } from "./test-run-executor";
// import { TestRunExecutor } from "./test-run-executor";
import { TestRunner } from "./test-runner";
import { TestServer } from "./test-server";
import { TestServerExecutor } from "./test-server-executor";
// import { TestServerExecutor } from "./test-server-executor";

export interface TestFactory extends Disposable {
    
  createTestServer( testServerExecutor?: TestServerExecutor): TestServer;
  
  createTestRunner(
    karmaEventListener: KarmaEventListener,
    specToTestSuiteMapper: SpecResponseToTestSuiteInfoMapper,
    testRunExecutor?: TestRunExecutor): TestRunner;

  createTestServerExecutor(): TestServerExecutor;

  createTestRunExecutor(): TestRunExecutor;
}