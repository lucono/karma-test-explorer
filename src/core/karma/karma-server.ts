import { CommandlineProcessHandler } from "../integration/commandline-process-handler";
// import { KarmaEventListener } from "../integration/karma-event-listener";
import { Logger } from "../helpers/logger";
import { TestExplorerConfiguration } from "../../model/test-explorer-configuration";
import { SpawnOptions } from "child_process";
import {stopper as karmaStopper } from "karma";
import { parse as parseEnvironmentFile } from "dotenv";
import { readFile } from "fs";


// export interface KarmaServerStartupResult {
//   serverKarmaPort: number,
//   serverSocketPort: number
// }

export class KarmaServer {
  private serverProcess?: CommandlineProcessHandler;
  private serverPort?: number;

  public constructor(
    // private readonly karmaEventListener: KarmaEventListener,
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

      const envFileContent = await new Promise<Buffer>((resolve, reject) => {
        readFile(config.envFile!, (err, data) => {
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
        const entryCount = Object.keys(envFileEnvironment).length;
        this.logger.info(`Fetched ${entryCount} environment entries from file: ${config.envFile}`);
      }
    }

    const testExplorerEnvironment = {
      ...process.env,
      ...envFileEnvironment,
      ...config.env,
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

    // const serverStartupResult: KarmaServerStartupResult = { serverKarmaPort, serverSocketPort };
    this.setServerInfo(karmaServerProcess, karmaPort);
    karmaServerProcess.futureExit().then(() => this.clearServerInfo(karmaServerProcess));
  }

  // public async restart(
  //   config: TestExplorerConfiguration, 
  //   karmaPort: number, 
  //   extraEnv: {[key: string]: string} = {}): Promise<number>
  // { 
  //   this.logger.info(`Restarting karma server`);

  //   if (this.isRunning()) {
  //     await this.kill();
  //   } else {
  //     this.logger.info(`Request to restart karma server - server is not already running`);
  //   }
  //   return this.start(config, karmaPort, extraEnv);
  // }

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

  // public getSocketPort(): number | undefined {
  //   return this.serverPort?.serverSocketPort;
  // }

  public isRunning(): boolean {
    return this.serverProcess !== undefined;
  }

  public async futureServerExit(): Promise<void> {
    return this.serverProcess?.futureExit();
  }
}
