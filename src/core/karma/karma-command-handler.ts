import { SpawnOptions } from "child_process";
import { accessSync, constants } from "fs";
import { TestExplorerConfiguration } from "../../model/test-explorer-configuration";
import { Logger } from "../helpers/logger";
import { CommandlineProcessHandler } from "../integration/commandline-process-handler";

enum KarmaOperation {
  Start = 'start',
  Run = 'run',
  Stop = 'stop'
}

export class KarmaCommandHandler {
  public constructor(
    private readonly logger: Logger,
    private readonly serverProcessLogger: (data: string, serverPort: number) => void = logger.info.bind(logger),
    private readonly serverProcessErrorLogger: (data: string, serverPort: number) => void = logger.error.bind(logger))
  {}

  public karmaStart(
    karmaPort: number,
    karmaSocketPort: number,
    config: TestExplorerConfiguration): CommandlineProcessHandler
  {
    return this.execute(KarmaOperation.Start, config, karmaPort, karmaSocketPort);
  }

  public karmaRun(
    karmaPort: number,
    clientArgs: string[],
    explorerConfig: TestExplorerConfiguration): CommandlineProcessHandler
  {
    return this.execute(KarmaOperation.Start, explorerConfig, karmaPort, undefined, clientArgs);
  }

  private execute(
    karmaOperation: KarmaOperation,
    explorerConfig: TestExplorerConfiguration,
    karmaPort: number,
    karmaSocketPort?: number,
    clientArgs?: string[]): CommandlineProcessHandler
  {
    const environment: { [key: string]: string } = {
      ...process.env,
      ...explorerConfig.envFileEnvironment,
      ...explorerConfig.env,
      karmaPort: `${karmaPort}`,
      userKarmaConfigPath: explorerConfig.userKarmaConfFilePath
    };

    if (karmaSocketPort) {
      environment.karmaSocketPort = `${karmaSocketPort}`;
    }

    const spawnOptions: SpawnOptions = {
      cwd: explorerConfig.projectRootPath,
      shell: true,
      env: environment
    };

    const baseKarmaConfigFilePath = require.resolve(explorerConfig.baseKarmaConfFilePath);
    const karmaProcessExecutable = explorerConfig.karmaProcessExecutable;

    let command = "npx";
    let processArguments = [ "karma" ];

    if (karmaProcessExecutable) {
      try {
        accessSync(karmaProcessExecutable, constants.X_OK);
      } catch (error) {
        throw new Error(
          `Not able to execute specified Karma process executable '${karmaProcessExecutable}': ` +
          `${error.message ?? error}`);
      }
      command = karmaProcessExecutable;
      processArguments = [];
    }

    processArguments = [
      ...processArguments,
      karmaOperation,
      baseKarmaConfigFilePath,
      `--port=${karmaPort}`,
      "--",
      ...(clientArgs ?? [])
    ];

    const karmaProcess = new CommandlineProcessHandler(
      this.logger, 
      command, 
      processArguments, 
      spawnOptions,
      (data) => this.serverProcessLogger(data, karmaPort),
      (data) => this.serverProcessErrorLogger(data, karmaPort));

    return karmaProcess;
  }
}
  