import { CommandlineProcessHandler } from "../integration/commandline-process-handler";
import { KarmaEventListener } from "../integration/karma-event-listener";
import { Logger } from "../helpers/logger";
import { TestExplorerConfiguration } from "../../model/test-explorer-configuration";
import { SpawnOptions } from "child_process";
import * as portFinder from "portfinder";
import {stopper as karmaStopper } from "karma";

export class KarmaServer {
  // private isServerRunning: boolean;
  private serverProcess?: CommandlineProcessHandler;
  private serverPort?: number;

  public constructor(
    private readonly karmaEventListener: KarmaEventListener,
    private readonly logger: Logger) { }

  public async start(config: TestExplorerConfiguration): Promise<void> {
    // const baseKarmaConfigFilePath = require.resolve(config.baseKarmaConfFilePath);
    const availablePort = await portFinder.getPortPromise({ startPort: config.karmaPort });

    const testExplorerEnvironment = {
      ...process.env,
      ...config.env,
      userKarmaConfigPath: config.userKarmaConfFilePath,
      karmaPort: `${availablePort}`,
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
      `--port=${availablePort}`
    ];

    const karmaServerProcess = new CommandlineProcessHandler(
      this.karmaEventListener, 
      this.logger, 
      command, 
      processArguments, 
      options);

    this.setServerInfo(karmaServerProcess, availablePort);

    const futureServerExit = karmaServerProcess.futureExit();
    futureServerExit.then(() => this.clearServerInfo());

    return futureServerExit;
  }

  private setServerInfo(serverProcess: CommandlineProcessHandler, serverPort: number) {
    this.serverProcess = serverProcess;
    this.serverPort = serverPort;
  }

  private clearServerInfo() {
    this.serverProcess = undefined;
    this.serverPort = undefined;
  }

  public getServerPort(): number | undefined {
    return this.serverPort;
  }

  public isRunning(): boolean {
    return this.serverProcess !== undefined;
  }

  public async stop(): Promise<void> {
    if (!this.isRunning()) {
      this.logger.info(`Karma Server is not running`);
      return;
    }
    this.logger.info(`Stopping Karma server`);
    
    return new Promise<void>((resolve) => {
      this.karmaEventListener.stopListeningToKarma();
      karmaStopper.stop({ port: this.serverPort }, (exitCode) => {
        if (exitCode === 0) {
          this.logger.info(`Server stopped with exit code: ${exitCode}`);
        }
        this.clearServerInfo();
        resolve();
      });
    });
  }

  // public async stop(): Promise<void> {
  //   if (!this.isRunning()) {
  //     this.logger.info(`Request to stop karma server - server is not running`);
  //     return;
  //   }
  //   this.logger.info(`Stopping karma server`);
  //   return this.serverProcess?.kill();
  // }

  // public async stop(): Promise<void> {
  //   this.logger.info(`Stopping Karma server`);
    
  //   // karmaStopper.stop({ port: this.karmaPort }, (exitCode: number) => {
  //   //   this.logger.info(`Karma exited succesfully`);
  //   // });

  //   if (this.isServerRunning()) {
  //     await this.karmaServerProcessHandler.kill();
  //     this.logger.info(`Stopped Karma server`);
  //   } else {
  //     this.logger.info(`Karma server is not running`);
  //   }
  //   this.karmaEventListener.stopListeningToKarma();
  // }
}
