import { Logger } from "../../core/logger";
import { ExtensionConfig } from "../../core/extension-config";
import { TestServerExecutor } from "../../api/test-server-executor";
import { AngularTestServerExecutor } from "../angular/angular-test-server-executor";
import { getDefaultAngularProject } from "../angular/angular-config-loader";
import { TestFactory } from "../../api/test-factory";
import { KarmaCommandLineTestServerExecutorOptions } from "../karma/server/karma-command-line-test-server-executor";
import { CommandLineProcessLog } from "../../util/commandline-process-handler";
import { KarmaEnvironmentVariable } from "../karma/karma-environment-variable";

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
      ...this.config.env,
      [KarmaEnvironmentVariable.AutoWatchEnabled]: `${this.config.autoWatchEnabled}`,
      [KarmaEnvironmentVariable.AutoWatchBatchDelay]: `${this.config.autoWatchBatchDelay}`,
      [KarmaEnvironmentVariable.Browser]: `${this.config.browser}`,
      [KarmaEnvironmentVariable.CustomLauncher]: JSON.stringify(this.config.customLauncher),
      [KarmaEnvironmentVariable.DebugLoggingEnabled]: `${this.config.debugLoggingEnabled}`
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
