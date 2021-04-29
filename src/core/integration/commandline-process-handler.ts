// import { KarmaEventListener } from "./karma-event-listener";
import { ChildProcess, SpawnOptions } from "child_process";
import { Logger } from "../helpers/logger";
import * as spawn from "cross-spawn";
import * as treeKill from "tree-kill";

export class CommandlineProcessHandler {
  private process: ChildProcess | undefined;
  private futureProcessExit: Promise<void>;
  private hasExited: boolean;

  public constructor(
    // private readonly karmaEventListener: KarmaEventListener,
    private readonly logger: Logger,
    command: string,
    processArguments: string[],
    runOptions?: SpawnOptions,
    private readonly processLogger: (data: string) => void = logger.info,
    private readonly processErrorLogger: (data: string) => void = logger.error)
  {
    this.hasExited = false;

    this.futureProcessExit = new Promise(async resolve => {
      this.logger.debug(
        `Executing command: '${command}'
        with args: ${JSON.stringify(processArguments)}`
        // and options: ${JSON.stringify(runOptions)}`
      );

      const process = spawn(command, processArguments, runOptions);
      const processPid = process.pid;

      this.process = process;
      this.setupProcessOutputs(process);

      process.on(
        "exit", (code, signal) => {
        const processCommand = `${command} ${processArguments.join(" ")}`;
        this.logger.debug(
          `Process PID ${processPid} exited ` +
          `with code '${code}' and signal '${signal}' ` +
          `for command: ${processCommand}`);

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
      this.logger.info(`Request to kill process - Process already exited`);
      return;
    }
    
    const process = this.process as ChildProcess;
    this.logger.info(`Killing process PID: ${process.pid}`);

    return new Promise<void>((resolve, reject) => {
      const processPid = process.pid;

      if (!processPid) {
        resolve();
        return;
      }
      treeKill(processPid, `SIGKILL`, async (error) => {
        if (error) {
          this.logger.error(`Failed to kill process PID '${processPid}': ${error}`);
          reject(error);
        } else {
          this.logger.info(`Successfully killed process PID '${processPid}'`);
          // this.updateProcessEnded();
          resolve();
        }
      });
    });
  }

  private setupProcessOutputs(process: ChildProcess) {
    process.stdout?.on("data", (data: any) => this.processLogger(`${data}`));
    process.stderr?.on(`data`, (data: any) => this.processErrorLogger(`stderr: ${data}`));
    process.on(`error`, (err: any) => this.logger.error(`error from child process: ${err}`));

    // Prevent karma server from being an orphan process.
    // For example, if VSCODE is killed using SIGKILL, karma server will still be alive.
    // When VSCODE is terminated, karma server's standard input is closed automatically.
    process.stdin?.on(`close`, async () => {
      // terminating orphan process
      this.kill();
    });
  }

  /*
  public killAsync(): Promise<void> {
    return new Promise<void>(resolve => {
      const treeKill = require("tree-kill");
      treeKill(this.process.pid, "SIGTERM", () => {
        this.updateProcessEnded();
        this.logger.info(`Karma exited succesfully`);
        resolve();
      });
    });
  }

  public kill(): void {
    if (!this.isProcessRunning()) {
      this.logger.info(`Request to kill process - Process is not running`);
      return;
    }
    this.logger.info(`Killing process PID: ${process.pid}`);

    treeKill(process.pid as number, `SIGKILL`);
    this.updateProcessEnded();
  }
  */
}
