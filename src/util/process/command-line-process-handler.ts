import { ChildProcess, SpawnOptions } from 'child_process';
import spawn from 'cross-spawn';
import treeKill from 'tree-kill';
import { Disposable } from '../disposable/disposable';
import { Disposer } from '../disposable/disposer';
import { DeferredExecution } from '../future/deferred-execution';
import { Execution } from '../future/execution';
import { Logger } from '../logging/logger';
import { generateRandomId } from '../utils';
import { CommandLineProcessLog } from './command-line-process-log';

export class CommandLineProcessHandler implements Disposable {
  private readonly uid: string;
  private childProcess: ChildProcess | undefined;
  private processExecution: Execution;
  private isRunning: boolean = false;
  private disposables: Disposable[] = [];

  public constructor(
    command: string,
    processArguments: string[],
    private readonly logger: Logger,
    processLog?: CommandLineProcessLog,
    runOptions?: SpawnOptions
  ) {
    this.uid = generateRandomId();
    const commandWithArgs = `${command} ${processArguments.join(' ')}`;

    const childProcessLog = processLog ?? {
      output: logger.info.bind(logger),
      error: logger.error.bind(logger)
    };

    this.logger.debug(
      () =>
        `Process ${this.uid}: \n` +
        `Executing command: '${command}' \n` +
        `with args: ${JSON.stringify(processArguments)}`
    );

    this.logger.trace(() => `Process ${this.uid} options: \n${JSON.stringify(runOptions)}`);

    const deferredProcessExecution = new DeferredExecution();
    this.processExecution = deferredProcessExecution.execution();

    const childProcess = spawn(command, processArguments, runOptions);
    this.childProcess = childProcess;
    const processPid = childProcess.pid;

    deferredProcessExecution.start();

    this.logger.debug(
      () => `Process ${this.uid} - process spawned successfully with PID ${processPid} for command: ${commandWithArgs}`
    );

    this.updateProcessRunning(true);

    childProcess.stdout?.on('data', (data: unknown) => childProcessLog.output(() => `${data}`));
    childProcess.stderr?.on('data', (data: unknown) => childProcessLog.error(() => `${data}`));

    childProcess.on('error', error => {
      this.logger.error(
        () => `Process ${this.uid} - Error from child process: '${error}' - for command: ${commandWithArgs}`
      );
      this.updateProcessRunning(false);
      deferredProcessExecution.fail(error);
    });

    childProcess.on('exit', (exitCode, signal) => {
      this.logger.debug(
        () =>
          `Process ${this.uid} - PID ${processPid} exited with code '${exitCode}' ` +
          `and signal '${signal}' for command: ${commandWithArgs}`
      );
      this.updateProcessRunning(false);
      deferredProcessExecution.end();
    });

    process.stdin.on('close', async (exitCode: number, signal: string) => {
      // Stop child process tree when main parent process stdio streams are closed
      this.logger.debug(
        () =>
          `Process ${this.uid} - PID ${processPid} closed with code '${exitCode}' ` +
          `and signal '${signal}' for command: ${commandWithArgs}`
      );
      this.kill();
    });
  }

  public async stop(): Promise<void> {
    return this.kill('SIGTERM');
  }

  private async kill(signal: string = 'SIGKILL'): Promise<void> {
    if (!this.isProcessRunning()) {
      this.logger.info(() => `Process ${this.uid} - Request to kill process - Process already exited`);
      return;
    }

    const runningProcess = this.childProcess!;
    this.logger.info(() => `Process ${this.uid} - Killing process tree of PID: ${runningProcess.pid}`);

    return new Promise<void>((resolve, reject) => {
      const processPid = runningProcess.pid;

      if (!processPid) {
        resolve();
        return;
      }

      treeKill(processPid, signal, error => {
        if (error) {
          this.logger.error(
            () => `Process ${this.uid} - Failed to terminate process tree for PID '${processPid}': ${error}`
          );
          reject(error);
        } else {
          this.logger.debug(() => `Process ${this.uid} - Successfully killed process tree for PID: ${processPid}`);
          resolve();
        }
      });
    });
  }

  public execution(): Execution {
    return this.processExecution;
  }

  private isProcessRunning(): boolean {
    return this.isRunning;
  }

  private updateProcessRunning(isRunning: boolean) {
    this.isRunning = isRunning;
  }

  public async dispose() {
    this.stop();
    await Disposer.dispose(this.disposables);
  }
}
