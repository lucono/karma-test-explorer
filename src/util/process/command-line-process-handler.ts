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

export enum CommandLineProcessLogOutput {
  Parent = 'Parent',
  None = 'None'
}

export interface CommandLineProcessHandlerOptions extends SpawnOptions {
  failOnStandardError?: boolean;
}

const DEFAULT_COMMAND_LINE_PROCESS_HANDLER_OPTIONS: CommandLineProcessHandlerOptions = {
  windowsHide: true,
  failOnStandardError: false
};

export class CommandLineProcessHandler implements Disposable {
  private readonly uid: string;
  private childProcess: ChildProcess | undefined;
  private processExecution: Execution;
  private isRunning: boolean = false;
  private processCurrentlyStopping: Promise<void> | undefined;
  private disposables: Disposable[] = [];

  // FIXME: Don't automatically run on instantiation. Use immutable UID that is
  // created on instantiation for the life of the object. Use start() method that
  // will execute the process and return a promise of successful start, which if
  // resolves successfully, returns a handle to an object for stopping the process.
  // Remove the stop method from the actual handler object, which is replaced by
  // the return value of the resolved call to the start() method. The methods
  // should probably not be start and stop, but run() and terminate() instead.

  public constructor(
    command: string,
    processArguments: string[],
    private readonly logger: Logger,
    processLog: CommandLineProcessLog | CommandLineProcessLogOutput = CommandLineProcessLogOutput.Parent,
    options?: CommandLineProcessHandlerOptions
  ) {
    this.uid = generateRandomId();
    const deferredProcessExecution = new DeferredExecution();
    const commandWithArgs = `${command} ${processArguments.join(' ')}`;

    const runOptions: CommandLineProcessHandlerOptions = {
      ...DEFAULT_COMMAND_LINE_PROCESS_HANDLER_OPTIONS,
      ...options
    };
    const parentProcessLog: CommandLineProcessLog = {
      output: data => logger.info(() => `[Process ${this.uid}][stdout]: ${data()}`),
      error: data => logger.error(() => `[Process ${this.uid}][stderr]: ${data()}`)
    };

    const childProcessLog =
      processLog === CommandLineProcessLogOutput.Parent
        ? parentProcessLog
        : processLog === CommandLineProcessLogOutput.None
        ? undefined
        : processLog;

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
        this.logger.debug(() => 'Process is not currently stopping - failing process execution');
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
    return this.kill('SIGTERM');
  }

  private async kill(signal: string = 'SIGKILL'): Promise<void> {
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

    const runningProcess = this.childProcess!;
    this.logger.info(() => `Process ${this.uid} - Killing process tree of PID: ${runningProcess.pid}`);

    const futureProcessTermination = new Promise<void>((resolve, reject) => {
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
    this.stop();
    await Disposer.dispose(this.disposables);
  }
}
