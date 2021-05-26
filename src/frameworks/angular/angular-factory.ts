import { Logger } from "../../util/logger";
import { ExtensionConfig } from "../../core/extension-config";
import { TestServerExecutor } from "../../api/test-server-executor";
import { AngularTestServerExecutor } from "../angular/angular-test-server-executor";
import { getDefaultAngularProject } from "../angular/angular-config-loader";
import { TestFactory } from "../../api/test-factory";
import { KarmaCommandLineTestServerExecutorOptions, ServerProcessLogger } from "../karma/karma-command-line-test-server-executor";
import { KARMA_SHARD_INDEX_ENV_VAR, KARMA_TOTAL_SHARDS_ENV_VAR } from "../karma/karma-constants";

export class AngularFactory implements Partial<TestFactory> {

  public constructor(
    private readonly config: ExtensionConfig,
    private readonly serverProcessLogger: ServerProcessLogger,
    private readonly logger: Logger)
  { }

  public createTestServerExecutor(
    serverShardIndex: number = 0,
    totalServerShards: number = 1): TestServerExecutor
  {
    this.logger.info(`Creating Angular test server executor`);
    
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
        serverProcessLogger: this.serverProcessLogger,
        serverProcessErrorLogger: this.serverProcessLogger
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
