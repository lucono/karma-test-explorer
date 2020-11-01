// import { KarmaEventListener } from "./karma-event-listener";
import { ChildProcess, SpawnOptions } from "child_process";
import { Logger } from "../helpers/logger";
import * as spawn from "cross-spawn";
import * as treeKill from "tree-kill";
// import { setTimeout } from 'timers';


export interface CommandlineProcessHandlerRunOptions extends SpawnOptions {
  prematureTerminationHandler?: (pid?: number) => void
}

export class CommandlineProcessHandler {
  private process: ChildProcess | undefined;
  private futureTermination?: Promise<void>;
  private isProcessTerminationInProgress: boolean = false;

  public constructor(
    // private readonly karmaEventListener: KarmaEventListener, 
    private readonly logger: Logger) {}

  public async run(command: string, processArguments: string[], runOptions?: CommandlineProcessHandlerRunOptions): Promise<void> {
    if (this.isProcessRunning()) {
      await this.kill();
    }

    this.logger.debug(
      `Executing command: '${command}' ` +
      `with args: ${JSON.stringify(processArguments)} `
      //`and options: ${JSON.stringify(runOptions)}`
    );

    const process = spawn(command, processArguments, runOptions);
    this.process = process;
    
    this.setupProcessOutputs(process);

    this.futureTermination = new Promise(async (resolve) => {
      process.on("exit", async (code, signal) => {
        const processTerminatedPrematurely = !this.isProcessTerminationInProgress && (code !== 0 || !!signal);
        const processCommand = `${command} ${processArguments.join(" ")}`;
        const terminatedPid = process?.pid;

        this.logger.debug(
          `Process PID ${terminatedPid} ${processTerminatedPrematurely ? "terminated prematurely" : "exited normally"} ` +
          `with code '${code}' and signal '${signal}' ` +
          `for command: ${processCommand}`);

          if (!this.isProcessTerminationInProgress) {
            // Kill any descendant processes that might still be alive
            this.logger.info(`Removing any orphan child processes for process PID: ${terminatedPid}`);
            await this.killTree(true);
          }

        this.updateProcessEnded();
        resolve();

        if (processTerminatedPrematurely && terminatedPid !== undefined) {
          runOptions?.prematureTerminationHandler?.(terminatedPid);
        }
      });
    });
  }

  /*
  public async onTermination() {
    return this.futureTermination || Promise.resolve();
  }
  */

  public isProcessRunning(): boolean {
    return this.process !== undefined;
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
  */

  public async kill(): Promise<void> {
    if (!this.isProcessRunning()) {
      this.logger.info(`Request to kill process - Process is not running`);
      return;
    }
    this.logger.info(`Killing process PID: ${this.process?.pid}`);

    //const futureTermination = this.futureTermination;

    await this.killTree();
    //await futureTermination;
  }

  private async killTree(noWait: boolean = false): Promise<void> {
    const process = this.process;
    await new Promise<void>(resolve => {
      if (!process) {
        resolve();
        return;
      }
      const futureTermination = this.futureTermination;
      this.isProcessTerminationInProgress = true;

      treeKill(process.pid, "SIGKILL", async () => {
        if (!noWait) {
          await futureTermination;
        }
        this.updateProcessEnded();
        //this.logger.info(`Successfully killed process PID: ${processPid}`);
        this.isProcessTerminationInProgress = false;
        resolve();
      });
    });
  }

  private setupProcessOutputs(process: ChildProcess) {
    process?.stdout?.on("data", (data: any) => {
      this.logger.info(`${data.toString()}`);
      /*
      const { isTestRunning } = this.karmaEventListener;
      const regex = new RegExp(/\(.*?)\m/, "g");
      if (isTestRunning) {
        let log = data.toString().replace(regex, "");
        if (log.startsWith("e ")) {
          log = "HeadlessChrom" + log;
        }
        this.logger.info(`${log}`, { divider: "Karma Logs" });
      }
      */
    });

    process?.stderr?.on("data", (data: any) => this.logger.error(`stderr: ${data}`));
    process?.on("error", (err: any) => this.logger.error(`error from child process: ${err}`));

    // Prevent karma server from being an orphan process.
    // For example, if VSCODE is killed using SIGKILL, karma server will still be alive.
    // When VSCODE is terminated, karma server's standard input is closed automatically.
    process?.stdin?.on("close", async () => {
      // terminating any orphan processes
      if (this.isProcessRunning()) {
        await this.killTree();
      }
    });
  }

  private updateProcessEnded() {
    this.process = undefined;
    this.futureTermination = undefined;
  }
}
