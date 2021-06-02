import { Logger } from "../../../core/logger";
import { ExtensionConfig } from "../../../core/extension-config";
import { TestServerExecutor } from "../../../api/test-server-executor";
import { KarmaCommandLineTestServerExecutor, KarmaCommandLineTestServerExecutorOptions } from "./karma-command-line-test-server-executor";
import { TestServer } from "../../../api/test-server";
import { KarmaServer } from "./karma-test-server";
import { Disposable } from "../../../api/disposable";
import { KARMA_SHARD_INDEX_ENV_VAR, KARMA_TOTAL_SHARDS_ENV_VAR } from "../karma-constants";
import { TestServerFactory } from "../../../api/test-server-factory";
import { OutputChannel, window } from "vscode";

export class KarmaTestServerFactory implements TestServerFactory {

  private disposables: Disposable[] = [];
  
  public constructor(
    private readonly config: ExtensionConfig,
    // private readonly serverProcessLogger: ServerProcessLogger,
    private readonly logger: Logger)
  {
    this.disposables.push(config, logger);
  }

  public createTestServer(testServerExecutor?: TestServerExecutor): TestServer {
    const serverExecutor = testServerExecutor ?? this.createTestServerExecutor();
    return new KarmaServer(serverExecutor, this.logger);
  }

  public createTestServerExecutor(
    serverShardIndex: number = 0,
    totalServerShards: number = 1): TestServerExecutor
  {
    return this.createKarmaCommandLineTestServerExecutor(serverShardIndex, totalServerShards);
  }

  private createKarmaCommandLineTestServerExecutor(
    serverShardIndex: number,
    totalServerShards: number): KarmaCommandLineTestServerExecutor
  {
    this.logger.info(`Creating Karma test server executor`);

    const serverLog: OutputChannel = window.createOutputChannel(`Karma Server ${serverShardIndex}`);
    
    const environment: { [key: string]: string | undefined } = {
      ...process.env,
      ...this.config.envFileEnvironment,
      ...this.config.env,
      [KARMA_SHARD_INDEX_ENV_VAR]: `${serverShardIndex}`,
      [KARMA_TOTAL_SHARDS_ENV_VAR]: `${totalServerShards}`
    };

    const options: KarmaCommandLineTestServerExecutorOptions = {
        environment,
        serverProcessLogger: (data, serverPort) => serverLog.append(`[server:${serverPort}] STDOUT: ${data}`),
        serverProcessErrorLogger: (data, serverPort) => serverLog.append(`[server:${serverPort}] STDERR: ${data}`)
    };

    return new KarmaCommandLineTestServerExecutor(
      this.config.projectRootPath,
      this.config.baseKarmaConfFilePath,
      this.config.userKarmaConfFilePath,
      options,
      this.logger);
  }

  public dispose() {
    this.disposables.forEach(disposable => disposable.dispose());
  }
}
