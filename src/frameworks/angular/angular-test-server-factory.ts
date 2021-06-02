import { Logger } from "../../core/logger";
import { ExtensionConfig } from "../../core/extension-config";
import { TestServerExecutor } from "../../api/test-server-executor";
import { AngularTestServerExecutor } from "./angular-test-server-executor";
import { getDefaultAngularProject } from "./angular-config-loader";
import { KarmaCommandLineTestServerExecutorOptions } from "../karma/server/karma-command-line-test-server-executor";
import { KARMA_SHARD_INDEX_ENV_VAR, KARMA_TOTAL_SHARDS_ENV_VAR } from "../karma/karma-constants";
import { TestServerFactory } from "../../api/test-server-factory";
import { OutputChannel, window } from "vscode";

export class AngularTestServerFactory implements Partial<TestServerFactory> {

  public constructor(
    private readonly config: ExtensionConfig,
    // private readonly serverProcessLogger: ServerProcessLogger,
    private readonly logger: Logger)
  { }

  public createTestServerExecutor(
    serverShardIndex: number = 0,
    totalServerShards: number = 1): TestServerExecutor
  {
    this.logger.info(`Creating Angular test server executor`);
    
    const serverLog: OutputChannel = window.createOutputChannel(`Karma Server ${serverShardIndex}`);
    
    const angularProject = getDefaultAngularProject(this.config.projectRootPath);

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

    return new AngularTestServerExecutor(
      angularProject,
      this.config.projectRootPath,
      this.config.baseKarmaConfFilePath,
      options,
      this.logger);
  }

  public dispose() {
    this.logger.dispose();

  }
}
