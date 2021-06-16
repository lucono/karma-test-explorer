import { Logger } from "../../core/logger";
import { ExtensionConfig } from "../../core/extension-config";
import { TestServerExecutor } from "../../api/test-server-executor";
import { AngularTestServerExecutor } from "../angular/angular-test-server-executor";
import { getDefaultAngularProject } from "../angular/angular-config-loader";
import { TestFactory } from "../../api/test-factory";
import { KarmaCommandLineTestServerExecutorOptions } from "../karma/server/karma-command-line-test-server-executor";
import { CommandLineProcessLog } from "../../util/commandline-process-handler";

export class AngularFactory implements Partial<TestFactory> {

  public constructor(
    private readonly config: ExtensionConfig,
    private readonly serverProcessLog: CommandLineProcessLog,
    private readonly logger: Logger)
  { }

  public createTestServerExecutor(): TestServerExecutor
  {
    this.logger.info(`Creating Angular test server executor`);
    
    const angularProject = getDefaultAngularProject(this.config.projectRootPath);

    const environment: { [key: string]: string | undefined } = {
      ...process.env,
      ...this.config.envFileEnvironment,
      ...this.config.env
    };

    const options: KarmaCommandLineTestServerExecutorOptions = {
        environment,
        serverProcessLog: this.serverProcessLog
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
