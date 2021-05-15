import { CommandlineProcessHandler } from "../integration/commandline-process-handler";
import { Logger } from "../helpers/logger";
import { TestExplorerConfiguration } from "../../model/test-explorer-configuration";
import { SpawnOptions } from "child_process";
import {stopper as karmaStopper } from "karma";
import { Execution } from "../helpers/execution";
import { DeferredPromise } from "../helpers/deferred-promise";

export class KarmaServer {
  private serverProcess?: CommandlineProcessHandler;
  private serverPort?: number;
  private serverCurrentlyTerminating: Promise<void> | undefined;
  private serverRestartTimerId: ReturnType<typeof setTimeout> | undefined;

  public constructor(
    private readonly logger: Logger,
    private readonly serverProcessLogger: (data: string, serverPort: number) => void = logger.info,
    private readonly serverProcessErrorLogger: (data: string, serverPort: number) => void = logger.error) { }

  public async start(
    karmaPort: number, 
    config: TestExplorerConfiguration,
    extraEnv: {[key: string]: string} = {}): Promise<Execution>
  {
    if (this.serverCurrentlyTerminating) {
      this.logger.info(
        `Request to start karma server - server is still shutting down. ` +
        `Waiting for termination to complete before commencing startup`);

      await this.serverCurrentlyTerminating;
    }
    
    if (this.isRunning()) {
      this.logger.info(`Request to start karma server - server is already running`);
      return {
        started: Promise.resolve(),
        stopped: this.futureServerExit()
      };
    }

    if (this.serverRestartTimerId) {
      this.cancelScheduledRestart(this.serverRestartTimerId);
    }
  
    this.logger.info(`Starting karma server`);

    const testExplorerEnvironment: { [key: string]: string} = {
      ...process.env,
      ...config.envFileEnvironment,
      ...config.env,
      ...extraEnv,
      userKarmaConfigPath: config.userKarmaConfFilePath,
      karmaPort: `${karmaPort}`
    };

    const spawnOptions: SpawnOptions = {
      cwd: config.projectRootPath,
      shell: true,
      env: testExplorerEnvironment,
    };

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
      spawnOptions,
      (data) => this.serverProcessLogger(data, karmaPort),
      (data) => this.serverProcessErrorLogger(data, karmaPort));

    this.setServerInfo(karmaServerProcess, karmaPort);

    karmaServerProcess.futureExit().then(() => {
      this.clearServerInfo(karmaServerProcess);

      const serverWasTerminating = this.serverCurrentlyTerminating;
      const wasUnexpectedServerTermination = !serverWasTerminating;
  
      if (serverWasTerminating) {
        this.serverCurrentlyTerminating = undefined;
      }

      if (wasUnexpectedServerTermination) {
        const restartDelay = config.serverCrashRestartDelaySecs;
        if (restartDelay >= 0) {
          this.logger.warn(
            `Karma server terminated unexpectedly - ` +
            `Will attempt restart in ${restartDelay} sec(s)`);
          this.scheduleFutureStartup(restartDelay, config, karmaPort, extraEnv);
        }
      }
    });

    const karmaServerExecution: Execution = {
      started: Promise.resolve(),
      stopped: karmaServerProcess.futureExit()
    };

    return karmaServerExecution;
  }

  private cancelScheduledRestart(serverRestartTimerId: NodeJS.Timeout) {
    if (this.serverRestartTimerId !== undefined && this.serverRestartTimerId === serverRestartTimerId) {
      clearTimeout(this.serverRestartTimerId);
      this.serverRestartTimerId = undefined;
    }
  }

  private scheduleFutureStartup(
    startDelaySecs: number,
    config: TestExplorerConfiguration, 
    karmaPort: number, 
    extraEnv: {[key: string]: string} = {})
  {
    if (this.serverRestartTimerId !== undefined) {
      this.cancelScheduledRestart(this.serverRestartTimerId);
    }
    const startDelayMillis = startDelaySecs * 1000;
    this.serverRestartTimerId = setTimeout(() => this.start(karmaPort, config, extraEnv), startDelayMillis);
  }

  public async stop(): Promise<void> {  // FIXME Not currently used
    if (!this.isRunning()) {
      this.logger.info(`Request to stop karma server - server is not running`);
      return;
    }
    const serverProcess = this.serverProcess!;
    const serverPort = this.serverPort!;

    this.logger.info(`Stopping Karma server on port ${serverPort}`);
    this.clearServerInfo(serverProcess);

    const serverCurrentlyTerminating = new Promise<void>((resolve) => {
      karmaStopper.stop({ port: serverPort }, async (exitCode) => {
        await serverProcess.futureExit();
        this.serverCurrentlyTerminating = undefined;
        this.logger.info(`Karma server on port ${serverPort} stopped with exit code: ${exitCode ?? 'unknown'}`);
        resolve();
      });
    });
    this.serverCurrentlyTerminating = serverCurrentlyTerminating;
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

    const serverIsTerminatingDeferred: DeferredPromise = new DeferredPromise<void>();
    const serverIsTerminatingPromise: Promise<void> = serverIsTerminatingDeferred.promise();
    this.serverCurrentlyTerminating = serverIsTerminatingPromise;

    await serverProcess.kill();
    await serverProcess.futureExit();
    // this.serverCurrentlyTerminating = undefined;
    this.logger.info(`Karma server on port ${serverPort} killed`);
    serverIsTerminatingDeferred.resolve();
  }

  public getServerPort(): number | undefined {
    return this.serverPort;
  }

  public isRunning(): boolean {
    return this.serverProcess !== undefined;
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

  private async futureServerExit(): Promise<void> {
    return this.serverProcess?.futureExit();
  }
}

