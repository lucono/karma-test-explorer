import { SpecResponseToTestSuiteInfoMapper } from "../frameworks/karma/runner/spec-response-to-test-suite-info-mapper";
import { MessageMatchingWorker } from "../util/message-matching-worker";
import { Disposable } from "./disposable";
import { TestRunExecutor } from "./test-run-executor";
// import { TestRunExecutor } from "./test-run-executor";
import { TestRunner } from "./test-runner";
import { TestServer } from "./test-server";
import { TestServerExecutor } from "./test-server-executor";
// import { TestServerExecutor } from "./test-server-executor";

export interface TestFactory extends Disposable {
    
  createTestServer(
    // serverShardIndex?: number ,
    // totalServerShards?: number,
    testServerExecutor?: TestServerExecutor
  ): TestServer;
  
  createTestRunner(
    karmaEventListenerWorker: MessageMatchingWorker,
    specToTestSuiteMapper: SpecResponseToTestSuiteInfoMapper,
    testRunExecutor?: TestRunExecutor): TestRunner;

  createTestServerExecutor(serverShardIndex?: number, totalServerShards?: number): TestServerExecutor;

  createTestRunExecutor(): TestRunExecutor;
}