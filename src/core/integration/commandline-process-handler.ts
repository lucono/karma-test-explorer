// import { KarmaEventListener } from "./karma-event-listener";
import { ChildProcess, SpawnOptions } from "child_process";
import { Logger } from "../helpers/logger";
import * as spawn from "cross-spawn";
// import * as treeKill from "tree-kill";
import * as psTree from "ps-tree";

export class CommandlineProcessHandler {
  private readonly uid: string;
  private process: ChildProcess | undefined;
  private futureProcessExit: Promise<void>;
  private hasExited: boolean;

  public constructor(
    private readonly logger: Logger,
    command: string,
    processArguments: string[],
    runOptions?: SpawnOptions,
    private readonly processLogger: (data: string) => void = logger.info.bind(logger),
    private readonly processErrorLogger: (data: string) => void = logger.error.bind(logger))
  {
    this.uid = Math.random().toString(36).slice(2); // TODO: Extract to utility function
    this.hasExited = false;

    this.logger.debug(() =>
      `Process ${this.uid}:
      Executing command: '${command}'
      with args: ${JSON.stringify(processArguments)}`
      // and options: ${JSON.stringify(runOptions)}`
    );

    const process = spawn(command, processArguments, runOptions);
    const processPid = process.pid;

    this.logger.debug(() =>
      `Process ${this.uid}:
      PID is ${processPid} for command: '${command}'
      with args: ${JSON.stringify(processArguments)}`
    );

    this.process = process;
    this.setupProcessOutputs(process);

    this.futureProcessExit = new Promise(async resolve => {
      process.on("exit", (code, signal) => {
        const processCommand = `${command} ${processArguments.join(" ")}`;
        this.logger.debug(() =>
          `Process ${this.uid}:
          PID ${processPid} exited
          with code '${code}' and signal '${signal}'
          for command: ${processCommand}`);

        this.updateProcessEnded();
        resolve();
      });
    });
  }

  public isProcessRunning(): boolean {
    return !this.hasExited;
  }

  public async futureExit(): Promise<void> {
    return this.futureProcessExit;
  }

  private updateProcessEnded() {
    this.hasExited = true;
  }

  public async kill(): Promise<void> {
    if (!this.isProcessRunning()) {
      this.logger.info(`Process ${this.uid}: Request to kill process - Process already exited`);
      return;
    }
    
    const runningProcess = this.process as ChildProcess;
    this.logger.info(`Process ${this.uid}: Killing process tree of PID: ${runningProcess.pid}`);

    return new Promise<void>((resolve, reject) => {
      const processPid = runningProcess.pid;

      if (!processPid) {
        resolve();
        return;
      }

      psTree(processPid, (error, childProcesses) => {
        if (error) {
          this.logger.error(`Process ${this.uid}: Failed to kill process tree for PID '${processPid}': ${error}`);
          reject(error);
        } else {
          childProcesses.forEach(childProcess => process.kill(Number(childProcess.PID), 'SIGKILL'));
          this.logger.info(`Process ${this.uid}: Successfully killed process tree for PID: ${processPid}`);
          resolve();
        }
      });
    });
  }

  private setupProcessOutputs(process: ChildProcess) {
    process.stdout?.on("data", (data: any) => this.processLogger(`${data}`));
    process.stderr?.on(`data`, (data: any) => this.processErrorLogger(`stderr: ${data}`));
    process.on(`error`, (err: any) => this.logger.error(`Process ${this.uid}: Error from child process: ${err}`));

    // Prevent karma server from being an orphan process.
    // For example, if VSCODE is killed using SIGKILL, karma server will still be alive.
    // When VSCODE is terminated, karma server's standard input is closed automatically.
    process.stdin?.on(`close`, async () => {
      // terminating orphan process
      if (this.isProcessRunning()) {
        this.kill();
      }
    });
  }
}
