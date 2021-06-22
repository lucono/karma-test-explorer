import { SpawnOptions } from "child_process";
import { existsSync } from "fs";
// import { ExtensionConfig } from "../../core/extension-config";
import { Logger } from "../../core/logger";
import { CommandLineProcessHandler, CommandLineProcessLog } from "../../util/commandline-process-handler";
import { join } from "path";
import { silent } from "resolve-global";
import { window } from "vscode";
import { AngularProject } from "./angular-project";
// import { getDefaultAngularProject } from "./angular-config-loader";
import { ServerStopExecutor, TestServerExecutor } from "../../api/test-server-executor";
import { Execution } from "../../api/execution";
import { KarmaEnvironmentVariable } from "../karma/karma-environment-variable";

export interface AngularTestServerExecutorOptions {
  environment: { [key: string]: string | undefined };
  angularProcessCommand?: string;
  serverProcessLog?: CommandLineProcessLog;
}

export class AngularTestServerExecutor implements TestServerExecutor {
  public constructor(
    private readonly angularProject: AngularProject,
    private readonly workspaceRootPath: string,
    private readonly baseKarmaConfFile: string,
    private readonly options: AngularTestServerExecutorOptions,  // FIXME: Options should be optional
    private readonly logger: Logger)
  {}

  public executeServerStart(
    karmaPort: number,
    karmaSocketPort: number): Execution<ServerStopExecutor>
  {
    const env: { [key: string]: string } = {
      ...this.options.environment,
      [KarmaEnvironmentVariable.UserKarmaConfigPath]: this.angularProject.karmaConfigPath,
      [KarmaEnvironmentVariable.KarmaPort]: `${karmaPort}`,
      [KarmaEnvironmentVariable.KarmaSocketPort]: `${karmaSocketPort}`
    };

    const spawnOptions: SpawnOptions = {
      cwd: this.angularProject.rootPath,
      shell: true,
      env
    };

    const baseKarmaConfigFilePath = require.resolve(this.baseKarmaConfFile);
    const angularProcessCommad = this.options.angularProcessCommand;
    const localAngularPath = join(this.workspaceRootPath, "node_modules", "@angular", "cli", "bin", "ng");
    const isAngularInstalledLocally = existsSync(localAngularPath);
    const isAngularInstalledGlobally = silent("@angular/cli") !== undefined;

    let command: string;
    let processArguments: string[] = [];

    if (angularProcessCommad) {
      command = angularProcessCommad;

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

    processArguments = [
      ...processArguments,
      `test`,
      this.angularProject.name,
      `--karma-config=${baseKarmaConfigFilePath}`,
      `--progress=false`,
      `--no-watch`
    ];

    const angularProcess = new CommandLineProcessHandler(
      command,
      processArguments,
      this.logger,
      this.options.serverProcessLog,
      spawnOptions);

    const serverStopper: ServerStopExecutor = {
      executeServerStop: async () => angularProcess.stop()
    };

    const serverExecution: Execution<ServerStopExecutor> = {
      started: () => angularProcess.execution().started().then(() => serverStopper),
      ended: angularProcess.execution().ended
    };

    return serverExecution;
  }
}
  