import { Promise as RichPromise } from 'bluebird';
import { ChildProcess, spawn, SpawnOptions } from 'child_process';
import treeKill from 'tree-kill';
import { Disposable } from '../disposable/disposable';
import { Disposer } from '../disposable/disposer';
import { DeferredExecution } from '../future/deferred-execution';
import { Execution } from '../future/execution';
import { Logger } from '../logging/logger';
import { generateRandomId } from '../utils';
import { Process } from './process';
import { ProcessLog } from './process-log';

export enum SimpleProcessLogOutput {
  Parent = 'Parent',
  None = 'None'
}

export interface SimpleProcessOptions extends SpawnOptions {
  failOnStandardError?: boolean;
  processLog?: ProcessLog | SimpleProcessLogOutput;
  parentProcessName?: string;
}

const DEFAULT_COMMAND_LINE_PROCESS_HANDLER_OPTIONS: SimpleProcessOptions = {
  windowsHide: true,
  failOnStandardError: false,
  processLog: SimpleProcessLogOutput.Parent
};

const allActiveProcesses: Set<SimpleProcess> = new Set();

export class SimpleProcess implements Process {
  private readonly uid: string;
  private childProcess: ChildProcess;
  private processExecution: Execution;
  private isRunning: boolean = false;
  private processCurrentlyStopping: Promise<void> | undefined;
  private disposables: Disposable[] = [];

  public constructor(
    command: string,
    processArguments: string[],
    private readonly logger: Logger,
    options?: SimpleProcessOptions
  ) {
    allActiveProcesses.add(this);
    this.uid = generateRandomId();
    const deferredProcessExecution = new DeferredExecution();
    const commandWithArgs = `${command} ${processArguments.join(' ')}`;

    const runOptions: SimpleProcessOptions = {
      ...DEFAULT_COMMAND_LINE_PROCESS_HANDLER_OPTIONS,
      ...options
    };
    const parentProcessLog: ProcessLog = {
      output: data => logger.info(() => `[Process ${this.uid}][stdout]: ${data()}`),
      error: data => logger.error(() => `[Process ${this.uid}][stderr]: ${data()}`)
    };

    const childProcessLog =
      runOptions.processLog === SimpleProcessLogOutput.Parent
        ? parentProcessLog
        : runOptions.processLog === SimpleProcessLogOutput.None
        ? undefined
        : runOptions.processLog;

    this.logger.debug(
      () =>
        `Process ${this.uid}: \n` +
        `Executing command: '${command}' \n` +
        `with args: ${JSON.stringify(processArguments)}`
    );

    this.logger.trace(() => `Process ${this.uid} options: \n${JSON.stringify(runOptions)}`);

    this.processExecution = deferredProcessExecution.execution();

    const childProcess = spawn(command, processArguments, runOptions);
    this.childProcess = childProcess;
    const processPid = childProcess.pid;

    if (processPid) {
      this.updateProcessRunning(true);
      deferredProcessExecution.start();

      this.logger.debug(
        () =>
          `Process ${this.uid} - process spawned successfully ` +
          `with PID ${processPid} for command: ${commandWithArgs}`
      );
    }

    if (childProcessLog) {
      childProcess.stdout?.on('data', (data: unknown) => childProcessLog.output(() => `${data}`));
      childProcess.stderr?.on('data', (data: unknown) => childProcessLog.error(() => `${data}`));
    }

    if (runOptions.failOnStandardError) {
      childProcess.stderr?.on('data', (data: unknown) => {
        const errorContent = 'Error: ' + `${data}`;
        deferredProcessExecution.fail(errorContent);
      });
    }

    childProcess.on('error', error => {
      this.logger.error(
        () => `Process ${this.uid} - Error from child process: '${error}' - for command: ${commandWithArgs}`
      );
      this.updateProcessRunning(false);

      if (this.processCurrentlyStopping) {
        this.logger.debug(() => 'Process is currently stopping - ending process execution');
        deferredProcessExecution.end();
      } else {
        this.logger.debug(() => 'Process is not currently stopping - Failing process execution');
        deferredProcessExecution.fail(error);
      }
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
    return this.terminate('SIGTERM');
  }

  public async kill(): Promise<void> {
    return this.terminate('SIGKILL');
  }

  private async terminate(signal: string): Promise<void> {
    allActiveProcesses.delete(this);

    if (!this.isProcessRunning()) {
      this.logger.info(() => `Process ${this.uid} - Request to kill process - Process already exited`);
      return;
    }

    if (this.processCurrentlyStopping) {
      this.logger.info(
        () =>
          `Process ${this.uid} - Request to kill process - ` +
          `Process is already terminating - Joining existing termination operation`
      );
      return this.processCurrentlyStopping;
    }

    const runningProcess = this.childProcess;
    this.logger.debug(() => `Process ${this.uid} - Killing process tree of PID: ${runningProcess.pid}`);

    const futureProcessTermination = new RichPromise<void>((resolve, reject) => {
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

    this.processCurrentlyStopping = futureProcessTermination;
    return futureProcessTermination;
  }

  public execution(): Execution {
    return this.processExecution;
  }

  private isProcessRunning(): boolean {
    return this.isRunning;
  }

  private updateProcessRunning(isRunning: boolean) {
    this.isRunning = isRunning;

    if (!isRunning) {
      this.processCurrentlyStopping = undefined;
    }
  }

  public async dispose() {
    this.kill();
    await Disposer.dispose(this.disposables);
  }

  public static async terminateAll() {
    const futureProcessTerminations = [...allActiveProcesses].map(processHandler => processHandler.kill());
    const futureTerminationCompletion = RichPromise.allSettled(futureProcessTerminations);
    await futureTerminationCompletion;
  }
}
