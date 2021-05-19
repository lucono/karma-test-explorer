import { SpawnOptions } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { silent } from "resolve-global";
import { window } from "vscode";
import { Logger } from "../../util/logger";
import { CommandlineProcessHandler } from "../../util/commandline-process-handler";
import { TestServerExecutor } from "../../api/test-server-executor";
import { Execution } from "../../api/execution";
import { TestRunExecutor } from "../../api/test-run-executor";

export class KarmaCommandLineExecutor implements TestServerExecutor, TestRunExecutor {
  public constructor(
    // private readonly config: TestExplorerConfiguration,
    private readonly logger: Logger,
    private readonly serverProcessLogger: (data: string, serverPort: number) => void = logger.info.bind(logger),
    private readonly serverProcessErrorLogger: (data: string, serverPort: number) => void = logger.error.bind(logger))
  {}

  public executeServerStart(
    karmaPort: number,
    karmaSocketPort: number): Execution
  {
    return this.execute('start', karmaPort, karmaSocketPort);
  }

  public executeTestRun(
    karmaPort: number,
    clientArgs: string[]): Execution
  {
    return this.execute('run', karmaPort, undefined, clientArgs);
  }

  private execute(
    karmaOperation: 'start' | 'run',
    projectRootPath: string,
    karmaPort: number,
    karmaSocketPort?: number,
    clientArgs: string[] = [],
    environment: { [key: string]: string } = {}): Execution
  {
    const spawnOptions: SpawnOptions = {
      cwd: projectRootPath,
      shell: true,
      env: environment
    };

    const localKarmaPath = join(projectRootPath, "node_modules", "karma", "bin", "karma");
    const isKarmaInstalledLocally = existsSync(localKarmaPath);
    const isKarmaInstalledGlobally = silent("karma") !== undefined;

    let command: string;
    let processArguments: string[] = [];

    if (customServerCommand) {
      command = customServerCommand;

    } else if (isKarmaInstalledLocally) {
      command = "npx";
      processArguments = [ "karma" ];

    } else if (isKarmaInstalledGlobally) {
      command = "karma";

    } else {
      const errorMessage = `Karma does not seem to be installed. Please install it and try again.`;
      window.showErrorMessage(errorMessage);
      throw new Error(errorMessage);
    }

    const escapedClientArgs: string[] = clientArgs.map(arg => arg.replace(/[\W ]/g, "\\$&"));
    processArguments = [ ...processArguments, karmaOperation, karmaConfigFilePath, "--", ...escapedClientArgs ];

    const serverProcess = new CommandlineProcessHandler(
      this.logger, 
      command, 
      processArguments, 
      spawnOptions,
      this.serverProcessLogger,
      this.serverProcessErrorLogger);

    return serverProcess;
  }

  private execute_(  // FIXME: Remove
    karmaOperation: 'start' | 'run',
    karmaPort: number,
    karmaSocketPort?: number,
    clientArgs?: string[]): Execution
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
    const karmaProcessExecutable = this.config.karmaProcessExecutable;

    const localKarmaPath = join(this.config.projectRootPath, "node_modules", "karma", "bin", "karma");
    const isKarmaInstalledLocally = existsSync(localKarmaPath);
    const isKarmaInstalledGlobally = silent("karma") !== undefined;

    let command: string;
    let processArguments: string[] = [];

    if (karmaProcessExecutable) {
      command = karmaProcessExecutable;

    } else if (isKarmaInstalledLocally) {
      command = "npx";
      processArguments = [ "karma" ];

    } else if (isKarmaInstalledGlobally) {
      command = "karma";

    } else {
      const errorMessage = `Karma does not seem to be installed. Please install it and try again.`;
      window.showErrorMessage(errorMessage);
      throw new Error(errorMessage);
    }

    if (karmaProcessExecutable) {
      command = karmaProcessExecutable;
      processArguments = [];
    }

    const escapedClientArgs: string[] = clientArgs
      ? clientArgs.map(arg => arg.replace(/[\W ]/g, "\\$&"))
      : [];

    processArguments = [
      ...processArguments,
      karmaOperation,
      baseKarmaConfigFilePath,
      `--port=${karmaPort}`,
      "--",
      ...escapedClientArgs
    ];

    const karmaProcess = new CommandlineProcessHandler(
      this.logger, 
      command, 
      processArguments, 
      spawnOptions,
      (data) => this.serverProcessLogger(data, karmaPort),
      (data) => this.serverProcessErrorLogger(data, karmaPort));

    return karmaProcess.execution();
  }
}
