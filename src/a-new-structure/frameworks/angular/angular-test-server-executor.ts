import { SpawnOptions } from "child_process";
import { existsSync } from "fs";
import { ExtensionConfig } from "../../core/extension-config";
import { Logger } from "../../util/logger";
import { CommandlineProcessHandler } from "../../util/commandline-process-handler";
import { join } from "path";
import { silent } from "resolve-global";
import { window } from "vscode";
import { AngularProject } from "./angular-project";
import { getDefaultAngularProject } from "./angular-config-loader";
import { TestServerExecutor } from "../../api/test-server-executor";
import { Execution } from "../../api/execution";

export class AngularTestServerExecutor implements TestServerExecutor {
  public constructor(
    private readonly config: ExtensionConfig,
    private readonly logger: Logger,
    private readonly serverProcessLogger: (data: string, serverPort: number) => void = logger.info.bind(logger),
    private readonly serverProcessErrorLogger: (data: string, serverPort: number) => void = logger.error.bind(logger))
  {}

  public executeServerStart(
    karmaPort: number,
    karmaSocketPort?: number): Execution
  {
    const environment: { [key: string]: string } = {
      ...process.env,
      ...this.config.envFileEnvironment,
      ...this.config.env,
      karmaPort: `${karmaPort}`,
      userKarmaConfigPath: this.config.userKarmaConfFilePath
    };

    if (karmaSocketPort) {
      environment.karmaSocketPort = `${karmaSocketPort}`;
    }

    const spawnOptions: SpawnOptions = {
      cwd: this.config.projectRootPath,
      shell: true,
      env: environment
    };

    const baseKarmaConfigFilePath = require.resolve(this.config.baseKarmaConfFilePath);
    const angularProcessExecutable = this.config.karmaProcessExecutable;
    const localAngularPath = join(this.config.projectRootPath, "node_modules", "@angular", "cli", "bin", "ng");
    const isAngularInstalledLocally = existsSync(localAngularPath);
    const isAngularInstalledGlobally = silent("@angular/cli") !== undefined;

    let command: string;
    let processArguments: string[] = [];

    if (angularProcessExecutable) {
      command = angularProcessExecutable;

    } else if (isAngularInstalledLocally) {
      command = "npx";
      processArguments.push("ng");

    } else if (isAngularInstalledGlobally) {
      command = "ng";

    } else {
      const errorMessage = `@angular/cli does not seem to be installed. Please install it and try again.`;
      window.showErrorMessage(errorMessage);
      throw new Error(errorMessage);
    }

    const angularProject: AngularProject = getDefaultAngularProject(this.config.projectRootPath);

    processArguments = [
      ...processArguments,
      `test`,
      angularProject.name,
      `--karma-config=${baseKarmaConfigFilePath}`,
      `--progress=false`,
      `--no-watch`
    ];

    const angularProcess = new CommandlineProcessHandler(
      this.logger, 
      command, 
      processArguments, 
      spawnOptions,
      (data) => this.serverProcessLogger(data, karmaPort),
      (data) => this.serverProcessErrorLogger(data, karmaPort));

    return angularProcess.execution();
  }
}
  