import { TestServer } from '../../../api/test-server';
import { ServerStopExecutor, TestServerExecutor } from '../../../api/test-server-executor';
import { Disposable } from '../../../util/disposable/disposable';
import { Disposer } from '../../../util/disposable/disposer';
import { DeferredExecution } from '../../../util/future/deferred-execution';
import { Execution } from '../../../util/future/execution';
import { Logger } from '../../../util/logging/logger';

type ServerExecutionInfo = {
  serverExecution: Execution<ServerStopExecutor>;
  serverStopper: ServerStopExecutor;
  serverPort: number;
};

export class KarmaTestServer implements TestServer {
  private serverExecutionInfo?: ServerExecutionInfo;
  private disposables: Disposable[] = [];

  public constructor(private readonly serverExecutionHandler: TestServerExecutor, private readonly logger: Logger) {
    this.disposables.push(logger);
  }

  public start(karmaPort: number, karmaSocketPort: number, debugPort?: number): Execution {
    const deferredServerExecution = new DeferredExecution();

    const startServer = async () => {
      try {
        if (this.isRunning()) {
          this.logger.info(() => 'Request to start karma server - server is currently running. Killing server');
          await this.stop();
        }

        this.logger.info(() => 'Starting karma server');

        const serverProcessExecution = this.serverExecutionHandler.executeServerStart(
          karmaPort,
          karmaSocketPort,
          debugPort
        );
        const serverStopper: ServerStopExecutor = await serverProcessExecution.started();

        const serverExecutionInfo: ServerExecutionInfo = {
          serverExecution: serverProcessExecution,
          serverStopper,
          serverPort: karmaPort
        };

        this.setServerInfo(serverExecutionInfo);

        serverProcessExecution.ended().then(() => {
          this.clearServerInfo(serverExecutionInfo);
          this.logger.debug(() => 'Karma server process terminated');
          deferredServerExecution.end();
        });

        serverProcessExecution.failed().then(reason => {
          deferredServerExecution.fail(reason);
        });

        deferredServerExecution.start();
      } catch (error) {
        this.logger.error(
          () =>
            `Failed to start server for requested karmaPort ${karmaPort} and karmaSocketPort ${karmaSocketPort}: ${error}`
        );
        deferredServerExecution.fail(error);
      }
    };

    startServer();
    return deferredServerExecution.execution();
  }

  public async stop(): Promise<void> {
    if (!this.isRunning()) {
      this.logger.info(() => 'Request to kill karma server - server is not running');
      return;
    }
    const serverExecutionInfo = this.serverExecutionInfo!;
    const serverExecution = serverExecutionInfo.serverExecution;
    const serverStopper = serverExecutionInfo.serverStopper!;
    const serverPort = serverExecutionInfo.serverPort!;

    this.logger.info(() => `Killing Karma server on port ${serverPort}`);
    this.clearServerInfo(serverExecutionInfo);

    await serverStopper.executeServerStop();
    await serverExecution.ended();

    this.logger.info(() => `Karma server on port ${serverPort} killed`);
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

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
