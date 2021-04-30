import { CommandlineProcessHandler } from "../integration/commandline-process-handler";
import { Logger } from "../helpers/logger";
import { TestExplorerConfiguration } from "../../model/test-explorer-configuration";
import { SpawnOptions } from "child_process";
import { readFile } from "fs";
import {stopper as karmaStopper } from "karma";
import { parse as parseEnvironmentFile } from "dotenv";
// import * as dotenvExpand from "dotenv-expand";

export class KarmaServer {
  private serverProcess?: CommandlineProcessHandler;
  private serverPort?: number;

  public constructor(
    private readonly logger: Logger,
    private readonly serverProcessLogger: (data: string, serverPort: number) => void = logger.info,
    private readonly serverProcessErrorLogger: (data: string, serverPort: number) => void = logger.error) { }

  public async start(
    config: TestExplorerConfiguration, 
    karmaPort: number, 
    extraEnv: {[key: string]: string} = {}): Promise<void> 
  {
    if (this.isRunning()) {
      this.logger.info(`Request to start karma server - server is already or still running`);
      return;
    }
    this.logger.info(`Starting karma server`);

    let envFileEnvironment = {} as { [key: string]: string};

    if (config.envFile) {
      this.logger.info(`Reading environment from file: ${config.envFile}`);

      const envFileContent = await new Promise<string>((resolve, reject) => {
        readFile(config.envFile!, "utf-8", (err, data) => {
          if (err) {
            this.logger.error(`Failed to read configured environment file: ${err}`);
            reject(err);
            return;
          }
          resolve(data);
        });
      });

      if (envFileContent) {
        envFileEnvironment = parseEnvironmentFile(envFileContent);
        // envFileEnvironment = dotenvExpand({ parsed: unexpandedEnvironment }).parsed ?? {};
        const entryCount = Object.keys(envFileEnvironment).length;
        this.logger.info(`Processed ${entryCount} entries from environment file: ${config.envFile}`);
      }
    }

    const testExplorerEnvironment = {
      ...envFileEnvironment,
      ...config.env,
      ...process.env,
      ...extraEnv,
      userKarmaConfigPath: config.userKarmaConfFilePath,
      karmaPort: `${karmaPort}`
    };

    const options = {
      cwd: config.projectRootPath,
      shell: true,
      env: testExplorerEnvironment,
    } as SpawnOptions;

    let command = "npx";
    let processArguments = [ "karma" ];

    if (config.karmaProcessExecutable) {
      command = config.karmaProcessExecutable;
      processArguments = [];
    }

    processArguments = [
      ...processArguments,
      "start",
      config.baseKarmaConfFilePath,
      `--port=${karmaPort}`
    ];

    const karmaServerProcess = new CommandlineProcessHandler(
      this.logger, 
      command, 
      processArguments, 
      options,
      (data) => this.serverProcessLogger(data, karmaPort),
      (data) => this.serverProcessErrorLogger(data, karmaPort));

    this.setServerInfo(karmaServerProcess, karmaPort);
    karmaServerProcess.futureExit().then(() => this.clearServerInfo(karmaServerProcess));
  }

  public async stop(): Promise<void> {
    if (!this.isRunning()) {
      this.logger.info(`Request to stop karma server - server is not running`);
      return;
    }
    const serverProcess = this.serverProcess!;
    const serverPort = this.serverPort!;

    this.logger.info(`Stopping Karma server on port ${serverPort}`);
    this.clearServerInfo(serverProcess);

    return new Promise<void>((resolve) => {
      karmaStopper.stop({ port: serverPort }, async (exitCode) => {
        await serverProcess.futureExit();
        this.logger.info(`Karma server on port ${serverPort} stopped with exit code: ${exitCode ?? 'unknown'}`);
        resolve();
      });
    });
  }

  public async kill(): Promise<void> {
    if (!this.isRunning()) {
      this.logger.info(`Request to kill karma server - server is not running`);
      return;
    }
    const serverProcess = this.serverProcess!;
    const serverPort = this.serverPort!;

    this.logger.info(`Killing Karma server on port ${serverPort}`);
    this.clearServerInfo(serverProcess);

    return new Promise<void>(async (resolve) => {
      await serverProcess.kill();
      await serverProcess.futureExit();
      this.logger.info(`Karma server on port ${serverPort} killed`);
      resolve();
    });
  }

  private setServerInfo(serverProcess: CommandlineProcessHandler, serverPort: number) {
    this.serverProcess = serverProcess;
    this.serverPort = serverPort;
  }

  private clearServerInfo(serverProcess?: CommandlineProcessHandler) {
    if (this.serverProcess && this.serverProcess === serverProcess) {
      this.serverProcess = undefined;
      this.serverPort = undefined;
    }
  }

  public getServerPort(): number | undefined {
    return this.serverPort;
  }

  public isRunning(): boolean {
    return this.serverProcess !== undefined;
  }

  public async futureServerExit(): Promise<void> {
    return this.serverProcess?.futureExit();
  }
}
