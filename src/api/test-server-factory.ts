import { TestServer } from "./test-server";
import { TestServerExecutor } from "./test-server-executor";
import { Disposable } from "./disposable";

export interface TestServerFactory extends Disposable {
    
  createTestServer(testServerExecutor: TestServerExecutor): TestServer;
  
  createTestServerExecutor(serverShardIndex?: number, totalServerShards?: number): TestServerExecutor;
}