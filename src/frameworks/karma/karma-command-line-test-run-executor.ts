import { SpawnOptions } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { silent } from "resolve-global";
import { window } from "vscode";
import { Logger } from "../../util/logger";
import { CommandlineProcessHandler } from "../../util/commandline-process-handler";
import { Execution } from "../../api/execution";
import { TestRunExecutor } from "../../api/test-run-executor";

export interface KarmaCommandLineTestRunExecutorOptions {
  environment: { [key: string]: string | undefined };
  karmaProcessCommand?: string;
  serverProcessLogger?: (data: string, serverPort: number) => void;
  serverProcessErrorLogger?: (data: string, serverPort: number) => void;
}

export class KarmaCommandLineTestRunExecutor implements TestRunExecutor {

  public constructor(
    private readonly projectRootPath: string,
    private readonly baseKarmaConfigFile: string,
    private readonly userKarmaConfigFile: string,
    private readonly options: KarmaCommandLineTestRunExecutorOptions,
    private readonly logger: Logger)
  {}

  public executeTestRun(
    karmaPort: number,
    clientArgs: string[]): Execution
  {
    const environment: { [key: string]: string } = {
      ...this.options.environment,
      karmaPort: `${karmaPort}`,
      userKarmaConfigPath: this.userKarmaConfigFile
    };

    const spawnOptions: SpawnOptions = {
      cwd: this.projectRootPath,
      shell: true,
      env: environment
    };

    const localKarmaPath = join(this.projectRootPath, "node_modules", "karma", "bin", "karma");
    const isKarmaInstalledLocally = existsSync(localKarmaPath);
    const isKarmaInstalledGlobally = silent("karma") !== undefined;

    let command: string;
    let processArguments: string[] = [];

    if (this.options.karmaProcessCommand) {
      command = this.options.karmaProcessCommand;

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

    const escapedClientArgs: string[] = clientArgs.map(arg => this.shellEscape(arg));

    processArguments = [
      ...processArguments,
      "run",
      this.baseKarmaConfigFile,
      // `--port=${karmaPort}`,
      `--no-refresh`,
      "--",
      ...escapedClientArgs
    ];

    const karmaServerProcess = new CommandlineProcessHandler(
      this.logger, 
      command, 
      processArguments, 
      spawnOptions,
      (data: string) => this.options.serverProcessLogger?.(data, karmaPort),
      (data: string) => this.options.serverProcessErrorLogger?.(data, karmaPort));

    return karmaServerProcess.execution();
  }

  private shellEscape(shellString: string) {
    return shellString.replace(/[\W ]/g, "\\$&");
  }
}
