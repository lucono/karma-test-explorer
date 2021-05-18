import { SpawnOptions } from "child_process";
import { existsSync } from "fs";
import { TestExplorerConfiguration } from "../../model/test-explorer-configuration";
import { Logger } from "../helpers/logger";
import { CommandlineProcessHandler } from "../integration/commandline-process-handler";
import { join } from "path";
import { silent } from "resolve-global";
import { window } from "vscode";
import { AngularProject } from "./angular-project";
import { getDefaultAngularProjectConfig } from "./angular-config-loader";
import { ServerCommandHandler } from "../karma/server-command-handler";

export class AngularCommandHandler implements ServerCommandHandler {
  public constructor(
    private readonly logger: Logger,
    private readonly serverProcessLogger: (data: string, serverPort: number) => void = logger.info.bind(logger),
    private readonly serverProcessErrorLogger: (data: string, serverPort: number) => void = logger.error.bind(logger))
  {}

  public start(
    karmaPort: number,
    karmaSocketPort: number,
    config: TestExplorerConfiguration): CommandlineProcessHandler
  {
    return this.execute('test', config, karmaPort, karmaSocketPort);
  }

  public run(
    karmaPort: number,
    clientArgs: string[],
    config: TestExplorerConfiguration): CommandlineProcessHandler
  {
    return this.execute('run', config, karmaPort, undefined, clientArgs);
  }

  private execute(
    angularOperation: 'test' | 'run',
    config: TestExplorerConfiguration,
    karmaPort: number,
    karmaSocketPort?: number,
    clientArgs?: string[]): CommandlineProcessHandler
  {
    const environment: { [key: string]: string } = {
      ...process.env,
      ...config.envFileEnvironment,
      ...config.env,
      karmaPort: `${karmaPort}`,
      userKarmaConfigPath: config.userKarmaConfFilePath
    };

    if (karmaSocketPort) {
      environment.karmaSocketPort = `${karmaSocketPort}`;
    }

    const spawnOptions: SpawnOptions = {
      cwd: config.projectRootPath,
      shell: true,
      env: environment
    };

    const baseKarmaConfigFilePath = require.resolve(config.baseKarmaConfFilePath);
    const angularProcessExecutable = config.karmaProcessExecutable;
    const localAngularPath = join(config.projectRootPath, "node_modules", "@angular", "cli", "bin", "ng");
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

    const escapedClientArgs: string[] = clientArgs
      ? clientArgs.map(arg => arg.replace(/[\W ]/g, "\\$&"))
      : [];

    const angularProject: AngularProject = getDefaultAngularProjectConfig(config.projectRootPath);

    processArguments = [
      ...processArguments,
      angularOperation,
      angularProject.name,
      `--karma-config=${baseKarmaConfigFilePath}`,
      `--progress=false`,
      `--no-watch`,
      "--",
      ...escapedClientArgs
    ];

    const angularProcess = new CommandlineProcessHandler(
      this.logger, 
      command, 
      processArguments, 
      spawnOptions,
      (data) => this.serverProcessLogger(data, karmaPort),
      (data) => this.serverProcessErrorLogger(data, karmaPort));

    return angularProcess;
  }
}
  