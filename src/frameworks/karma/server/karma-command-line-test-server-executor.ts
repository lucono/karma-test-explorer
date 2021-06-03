import { SpawnOptions } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { silent } from "resolve-global";
import { window } from "vscode";
import { Logger } from "../../../core/logger";
import { CommandlineProcessHandler } from "../../../util/commandline-process-handler";
import { ServerStopExecutor, TestServerExecutor } from "../../../api/test-server-executor";
import { Execution } from "../../../api/execution";
import { KARMA_PORT_ENV_VAR, KARMA_SOCKET_PORT_ENV_VAR, USER_KARMA_CONFIG_PATH_ENV_VAR } from "../karma-constants";

export type ServerProcessLogger = (data: string, serverPort: number) => void;

export interface KarmaCommandLineTestServerExecutorOptions {
  environment: { [key: string]: string | undefined };
  karmaProcessCommand?: string;
  serverProcessLogger?: ServerProcessLogger;
  serverProcessErrorLogger?: ServerProcessLogger;
}

export class KarmaCommandLineTestServerExecutor implements TestServerExecutor {
  public constructor(
    private readonly projectRootPath: string,
    private readonly baseKarmaConfigFile: string,
    private readonly userKarmaConfigFile: string,
    private readonly options: KarmaCommandLineTestServerExecutorOptions,
    private readonly logger: Logger)
  {}

  public executeServerStart(
    karmaPort: number,
    karmaSocketPort: number): Execution<ServerStopExecutor>
  {
    const environment: { [key: string]: string } = {
      ...this.options.environment,
      [KARMA_PORT_ENV_VAR]: `${karmaPort}`,
      [KARMA_SOCKET_PORT_ENV_VAR]: `${karmaSocketPort}`,
      [USER_KARMA_CONFIG_PATH_ENV_VAR]: this.userKarmaConfigFile
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

    processArguments = [
      ...processArguments,
      "start",
      this.baseKarmaConfigFile,
      // `--port=${karmaPort}`,
      `--no-auto-watch`,
      `--no-single-run`
    ];

    const karmaServerProcess = new CommandlineProcessHandler(
      this.logger, 
      command, 
      processArguments, 
      spawnOptions,
      (data: string) => this.options.serverProcessLogger?.(data, karmaPort),
      (data: string) => this.options.serverProcessErrorLogger?.(data, karmaPort));

    const serverStopper: ServerStopExecutor = {
      executeServerStop: async () => karmaServerProcess.stop()
    };
  
    const serverExecution: Execution<ServerStopExecutor> = {
      started: () => karmaServerProcess.execution().started().then(() => serverStopper),
      ended: karmaServerProcess.execution().ended
    };

    return serverExecution;
  }
}
