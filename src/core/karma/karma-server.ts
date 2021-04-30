import { CommandlineProcessHandler } from "../integration/commandline-process-handler";
// import { KarmaEventListener } from "../integration/karma-event-listener";
import { Logger } from "../helpers/logger";
import { TestExplorerConfiguration } from "../../model/test-explorer-configuration";
import { SpawnOptions } from "child_process";
import * as portFinder from "portfinder";
import {stopper as karmaStopper } from "karma";


export interface KarmaServerStartupResult {
  serverKarmaPort: number,
  serverSocketPort: number
}

export class KarmaServer {
  private serverProcess?: CommandlineProcessHandler;
  private serverStartupResult?: KarmaServerStartupResult;

  public constructor(
    // private readonly karmaEventListener: KarmaEventListener,
    private readonly logger: Logger,
    private readonly serverProcessLogger: (data: string, serverPort: number) => void = logger.info,
    private readonly serverProcessErrorLogger: (data: string, serverPort: number) => void = logger.error) { }

  public async start(config: TestExplorerConfiguration): Promise<KarmaServerStartupResult> 
  {
    if (this.isRunning()) {
      this.logger.info(`Request to start karma server - server is already or still running`);
      return { ...this.serverStartupResult! };
    }
    this.logger.info(`Starting karma server`);

    const serverKarmaPort = await portFinder.getPortPromise({ port: config.karmaPort });
    const minSocketConnectionPort = Math.max(config.defaultSocketConnectionPort, serverKarmaPort + 1);

    const serverSocketPort = await new Promise<number>(resolve => {
      portFinder.getPort(
        { port: minSocketConnectionPort }, 
        (err: Error, port: number) => resolve(port));
    });

    this.logger.info(`Using available karma port: ${config.karmaPort} --> ${serverKarmaPort}`);
    this.logger.info(`Using available socket port: ${config.defaultSocketConnectionPort} --> ${serverSocketPort}`);

    const testExplorerEnvironment = {
      ...process.env,
      ...config.env,
      userKarmaConfigPath: config.userKarmaConfFilePath,
      karmaPort: `${serverKarmaPort}`,
      karmaSocketPort: `${serverSocketPort}`
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
      `--port=${serverKarmaPort}`
    ];

    const karmaServerProcess = new CommandlineProcessHandler(
      this.logger, 
      command, 
      processArguments, 
      options,
      (data) => this.serverProcessLogger(data, serverKarmaPort),
      (data) => this.serverProcessErrorLogger(data, serverKarmaPort));

    const serverStartupResult: KarmaServerStartupResult = { serverKarmaPort, serverSocketPort };
    this.setServerInfo(karmaServerProcess, serverStartupResult);
    karmaServerProcess.futureExit().then(() => this.clearServerInfo(karmaServerProcess));

    return { ...serverStartupResult } as KarmaServerStartupResult;
  }

  public async restart(config: TestExplorerConfiguration): Promise<KarmaServerStartupResult> {
    this.logger.info(`Restarting karma server`);

    if (this.isRunning()) {
      await this.kill();
    } else {
      this.logger.info(`Request to restart karma server - server is not already running`);
    }
    return this.start(config);
  }

  public async stop(): Promise<void> {
    if (!this.isRunning()) {
      this.logger.info(`Request to stop karma server - server is not running`);
      return;
    }
    const serverProcess = this.serverProcess!;
    const serverPort = this.serverStartupResult!.serverKarmaPort;

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
    const serverPort = this.serverStartupResult!.serverKarmaPort;

    this.logger.info(`Killing Karma server on port ${serverPort}`);
    this.clearServerInfo(serverProcess);

    return new Promise<void>(async (resolve) => {
      await serverProcess.kill();
      await serverProcess.futureExit();
      this.logger.info(`Karma server on port ${serverPort} killed`);
      resolve();
    });
  }

  private setServerInfo(serverProcess: CommandlineProcessHandler, serverStartupResult: KarmaServerStartupResult) {
    this.serverProcess = serverProcess;
    this.serverStartupResult = serverStartupResult;
  }

  private clearServerInfo(serverProcess?: CommandlineProcessHandler) {
    if (this.serverProcess && this.serverProcess === serverProcess) {
      this.serverProcess = undefined;
      this.serverStartupResult = undefined;
    }
  }

  public getServerPort(): number | undefined {
    return this.serverStartupResult?.serverKarmaPort;
  }

  public getSocketPort(): number | undefined {
    return this.serverStartupResult?.serverSocketPort;
  }

  public isRunning(): boolean {
    return this.serverProcess !== undefined;
  }

  public async futureServerExit(): Promise<void> {
    return this.serverProcess?.futureExit();
  }
}
