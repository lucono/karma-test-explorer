import { TestServerExecutor } from '../../../api/test-server-executor.js';
import { TestServer } from '../../../api/test-server.js';
import { Disposable } from '../../../util/disposable/disposable.js';
import { Disposer } from '../../../util/disposable/disposer.js';
import { DeferredExecution } from '../../../util/future/deferred-execution.js';
import { Execution } from '../../../util/future/execution.js';
import { Logger } from '../../../util/logging/logger.js';
import { Process } from '../../../util/process/process.js';

type ServerExecutionInfo = {
  serverProcess: Process;
  serverPort: number;
};

export class KarmaTestServer implements TestServer {
  private serverExecutionInfo?: ServerExecutionInfo;
  private disposables: Disposable[] = [];

  public constructor(private readonly testServerExecutor: TestServerExecutor, private readonly logger: Logger) {
    this.disposables.push(logger);
  }

  public start(karmaPort: number, karmaSocketPort: number, debugPort?: number): Execution {
    const deferredServerExecution = new DeferredExecution();

    const startServer = async () => {
      try {
        if (this.isRunning()) {
          this.logger.debug(() => 'Request to start karma server - server is currently running. Killing server');
          await this.stop();
        }

        this.logger.info(() => 'Starting karma server');

        const serverProcess = this.testServerExecutor.executeServerStart(karmaPort, karmaSocketPort, debugPort);
        await serverProcess.execution().started();
        const serverExecutionInfo: ServerExecutionInfo = {
          serverProcess: serverProcess,
          serverPort: karmaPort
        };

        this.setServerInfo(serverExecutionInfo);

        serverProcess
          .execution()
          .ended()
          .then(() => {
            this.clearServerInfo(serverExecutionInfo);
            this.logger.debug(() => 'Karma server process terminated');
            deferredServerExecution.end();
          });

        serverProcess
          .execution()
          .failed()
          .then(reason => deferredServerExecution.fail(reason));

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
      this.logger.debug(() => 'Request to kill karma server - server is not running');
      return;
    }
    const serverExecutionInfo = this.serverExecutionInfo!;
    const serverProcess = serverExecutionInfo.serverProcess;
    const serverPort = serverExecutionInfo.serverPort;

    this.logger.info(() => `Killing Karma server on port ${serverPort}`);
    this.clearServerInfo(serverExecutionInfo);

    serverProcess.kill();
    await serverProcess.execution().ended();

    this.logger.debug(() => `Karma server on port ${serverPort} killed`);
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
