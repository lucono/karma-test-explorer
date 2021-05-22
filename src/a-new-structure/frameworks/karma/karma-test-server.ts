import { Logger } from "../../util/logger";
import { Execution } from "../../api/execution";
import { DeferredPromise } from "../../util/deferred-promise";
import { TestServer } from "../../api/test-server";
import { window } from "vscode";
import { ServerStopExecutor, TestServerExecutor } from "../../api/test-server-executor";

type ServerExecutionInfo = {
  serverExecution: Execution<ServerStopExecutor>,
  serverStopper: ServerStopExecutor,
  serverPort: number
};

export class KarmaServer implements TestServer {
  private serverExecutionInfo?: ServerExecutionInfo;
  private serverCurrentlyTerminating: Promise<void> | undefined;
  private serverRestartTimerId: ReturnType<typeof setTimeout> | undefined;

  public constructor(
    private readonly serverExecutionHandler: TestServerExecutor,
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

      const serverExecution = this.serverExecutionHandler.executeServerStart(karmaPort, karmaSocketPort);
      const serverStopper: ServerStopExecutor = await serverExecution.started();

      const serverExecutionInfo: ServerExecutionInfo = {
        serverExecution,
        serverStopper,
        serverPort: karmaPort
      };

      this.setServerInfo(serverExecutionInfo);

      serverExecution.stopped().then(() => {
        this.clearServerInfo(serverExecutionInfo);

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
      started: () => serverStartedPromise,
      stopped: () => serverStoppedDeferred.promise()
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
    const serverExecutionInfo = this.serverExecutionInfo!;
    const serverExecution = serverExecutionInfo.serverExecution;
    const serverStopper = serverExecutionInfo.serverStopper!;
    const serverPort = serverExecutionInfo.serverPort!;

    this.logger.info(`Killing Karma server on port ${serverPort}`);
    this.clearServerInfo(serverExecutionInfo);

    const serverIsTerminatingDeferred: DeferredPromise = new DeferredPromise<void>();
    const serverIsTerminatingPromise: Promise<void> = serverIsTerminatingDeferred.promise();
    this.serverCurrentlyTerminating = serverIsTerminatingPromise;

    await serverStopper.executeServerStop();
    await serverExecution.stopped();
    
    this.logger.info(`Karma server on port ${serverPort} killed`);
    serverIsTerminatingDeferred.resolve();
  }

  public getServerPort(): number | undefined {
    return this.serverExecutionInfo?.serverPort;
  }

  public isRunning(): boolean {
    return this.serverExecutionInfo !== undefined;
  }

  private setServerInfo(serverExecutionInfo: ServerExecutionInfo) {
    this.serverExecutionInfo = serverExecutionInfo;
  }

  private clearServerInfo(serverExecutionInfo: ServerExecutionInfo) {
    if (this.serverExecutionInfo && this.serverExecutionInfo === serverExecutionInfo) {
      this.serverExecutionInfo = undefined;
    }
  }

  private async futureServerExit(): Promise<void> {
    return this.serverExecutionInfo?.serverExecution.stopped();
  }
}

