import { CommandlineProcessHandler } from "../integration/commandline-process-handler";
// import { KarmaEventListener } from "../integration/karma-event-listener";
import { Logger } from "../helpers/logger";
import { TestExplorerConfiguration } from "../../model/test-explorer-configuration";
import { SpawnOptions } from "child_process";
import * as portFinder from "portfinder";
import {stopper as karmaStopper } from "karma";

export class KarmaServer {
  private serverProcess?: CommandlineProcessHandler;
  private serverPort?: number;

  public constructor(
    // private readonly karmaEventListener: KarmaEventListener,
    private readonly logger: Logger,
    private readonly serverProcessLogger: (data: string, serverPort: number) => void = logger.info,
    private readonly serverProcessErrorLogger: (data: string, serverPort: number) => void = logger.error) { }

  public async start(
    config: TestExplorerConfiguration): Promise<void> 
  {
    if (this.isRunning()) {
      this.logger.info(`Request to start karma server - server is already or still running`);
      return this.serverProcess?.futureExit();
    }
    const karmaPort = await portFinder.getPortPromise({ port: config.karmaPort });
    this.logger.info(`Available port lookup result: ${config.karmaPort} --> ${karmaPort}`);

    const testExplorerEnvironment = {
      ...process.env,
      ...config.env,
      userKarmaConfigPath: config.userKarmaConfFilePath,
      karmaPort: `${karmaPort}`,
      defaultSocketPort: `${config.defaultSocketConnectionPort}`
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

    const futureServerExit = karmaServerProcess.futureExit();
    futureServerExit.then(() => this.clearServerInfo(karmaServerProcess));
    return futureServerExit;
  }

  public async restart(config: TestExplorerConfiguration): Promise<void> {
    if (this.isRunning()) {
      await this.kill();
    }
    return this.start(config);
  }

  public async stop(): Promise<void> {
    if (!this.isRunning()) {
      this.logger.info(`Request to stop karma server - server is not running`);
      return;
    }
    const serverProcess = this.serverProcess;
    const serverPort = this.serverPort;

    this.logger.info(`Stopping Karma server on port ${serverPort}`);
    this.clearServerInfo(serverProcess);

    return new Promise<void>((resolve) => {
      karmaStopper.stop({ port: this.serverPort }, async (exitCode) => {
        await serverProcess?.futureExit();
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
    const serverProcess = this.serverProcess;
    const serverPort = this.serverPort;

    this.logger.info(`Killing Karma server on port ${serverPort}`);
    this.clearServerInfo(serverProcess);

    return new Promise<void>(async (resolve) => {
      await serverProcess?.kill();
      await serverProcess?.futureExit();
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
}
