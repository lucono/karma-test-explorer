import { TestServer } from "../api/test-server";
import { TestServerExecutor } from "../api/test-server-executor";
import { TestServerFactory } from "../api/test-server-factory";
import { Logger } from "./logger";

export class CascadingTestServerFactory implements TestServerFactory {

  public constructor(
    private readonly delegateTestFactories: Partial<TestServerFactory>[],
    private readonly logger: Logger)
  {}

  public createTestServer(testServerExecutor?: TestServerExecutor): TestServer {
    const delegateFactory = this.delegateTestFactories.find(factory => 'createTestServer' in factory);

    if (!delegateFactory) {
      throw new Error(
        `There are no delegate test factories able to fulfil ` +
        `requested action: Create Test Server`);
    }
    return delegateFactory.createTestServer!(testServerExecutor ?? this.createTestServerExecutor());
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
  
  public dispose(): void {
    this.logger.dispose();
  }
}