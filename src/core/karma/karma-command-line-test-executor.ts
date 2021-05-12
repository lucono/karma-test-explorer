import { Logger } from "../helpers/logger";
import { TestExplorerConfiguration } from "../../model/test-explorer-configuration";
import { KarmaRunConfig, TestRunExecutor } from "./test-run-executor";
import { CommandlineProcessHandler } from "../integration/commandline-process-handler";
import { SpawnOptions } from "child_process";

export class KarmaCommandLineTestExecutor implements TestRunExecutor {
    
  public constructor(private readonly logger: Logger) {}

  public async executeTestRun(karmaRunConfig: KarmaRunConfig, explorerConfig: TestExplorerConfiguration): Promise<void> {
    const environment = {
      ...process.env,
      ...explorerConfig.envFileEnvironment,
      ...explorerConfig.env,
      karmaSocketPort: `${explorerConfig.defaultSocketConnectionPort}`,
      userKarmaConfigPath: explorerConfig.userKarmaConfFilePath,
      karmaPort: `${karmaRunConfig.port}`
    };

    const spawnOptions: SpawnOptions = {
      cwd: explorerConfig.projectRootPath,
      shell: true,
      env: environment
    };

    const baseKarmaConfigFilePath = require.resolve(explorerConfig.baseKarmaConfFilePath);
    const clientArgs = karmaRunConfig.clientArgs.map(arg => arg.replace(/[\W ]/g, "\\$&"));
    let command = "npx";
    let processArguments = [ "karma" ];

    if (explorerConfig.karmaProcessExecutable) {
      command = explorerConfig.karmaProcessExecutable;
      processArguments = [];
    }

    processArguments = [
      ...processArguments,
      "run",
      baseKarmaConfigFilePath,
      `--port=${karmaRunConfig.port}`,
      "--",
      ...clientArgs
    ];

    const runTestsProcessHandler = new CommandlineProcessHandler(this.logger, command, processArguments, spawnOptions);
    return runTestsProcessHandler.futureExit();
  }
}