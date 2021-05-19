import { CommandlineProcessHandler } from "../../util/commandline-process-handler";
import { Logger } from "../../util/logger";
import { Execution } from "../../api/execution";
import { DeferredPromise } from "../../util/deferred-promise";
import { ServerCommandHandler } from "../../../core/karma/server-command-handler";
import { TestServer } from "../../api/test-server";
import { window } from "vscode";

export class KarmaServer implements TestServer {
  private serverProcess?: CommandlineProcessHandler;
  private serverPort?: number;
  private serverCurrentlyTerminating: Promise<void> | undefined;
  private serverRestartTimerId: ReturnType<typeof setTimeout> | undefined;

  public constructor(
    private readonly serverCommandHandler: ServerCommandHandler,
    private readonly logger: Logger)
  { }

  public start(
    karmaPort: number,
    karmaSocketPort: number): Execution
  {
    const serverStoppedDeferred: DeferredPromise = new DeferredPromise();

    const serverStartedPromise = new Promise<void>(async (resolve) => {
      if (this.serverCurrentlyTerminating) {
        this.logger.info(
          `Request to start karma server - server is still shutting down. ` +
          `Waiting for termination to complete before commencing startup`);

        await this.serverCurrentlyTerminating;
      }
      
      if (this.isRunning()) {
        this.logger.info(`Request to start karma server - server is already running`);

        resolve();
        this.futureServerExit().then(() => serverStoppedDeferred.resolve());
        return;
      }

      if (this.serverRestartTimerId) {
        this.cancelScheduledRestart(this.serverRestartTimerId);
      }
    
      this.logger.info(`Starting karma server`);

      const karmaServerProcess = this.serverCommandHandler.start(karmaPort, karmaSocketPort);

      this.setServerInfo(karmaServerProcess, karmaPort);

      karmaServerProcess.execution().stopped.then(() => {
        this.clearServerInfo(karmaServerProcess);

        const serverWasTerminating = this.serverCurrentlyTerminating;
        const wasUnexpectedServerTermination = !serverWasTerminating;
    
        if (serverWasTerminating) {
          this.serverCurrentlyTerminating = undefined;
        }
        serverStoppedDeferred.resolve();

        if (wasUnexpectedServerTermination) {
          const message = `The Karma server terminated unexpectedly. Restart the server?`;
          this.logger.error(message);

          window.showWarningMessage(message, 'Restart', 'Ignore').then(selection => {
            if (selection === 'Restart') {
              this.logger.info(`User chose to restart server`);
              this.scheduleFutureStartup(0, karmaPort, karmaSocketPort);

            } else {
              this.logger.info(`User chose not to restart server`);
            }
          });
        }
      });
      resolve();
    });

    const karmaServerExecution: Execution = {
      started: serverStartedPromise,
      stopped: serverStoppedDeferred.promise()
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
    karmaPort: number,
    karmaSocketPort: number)
  {
    if (this.serverRestartTimerId !== undefined) {
      this.cancelScheduledRestart(this.serverRestartTimerId);
    }
    const startDelayMillis = startDelaySecs * 1000;
    this.serverRestartTimerId = setTimeout(() => this.start(karmaPort, karmaSocketPort), startDelayMillis);
  }

  public async stop(): Promise<void> {
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

    await serverProcess.stop();
    await serverProcess.execution().stopped;
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
    return this.serverProcess?.execution().stopped;
  }
}

