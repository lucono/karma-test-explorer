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

  public run(command: string, processArguments: string[], runOptions?: CommandlineProcessHandlerRunOptions): Promise<any> {
    this.futureTermination = new Promise(resolve => {
      if (this.process) {
        this.kill();
      }

      this.logger.debug(
        `Executing command: '${command}' ` +
        `with args: ${JSON.stringify(processArguments)} ` +
        `and options: ${JSON.stringify(runOptions)}`
      );

      this.process = spawn(command, processArguments, runOptions);
      this.setupProcessOutputs();

      this.process.on("exit", async (code, signal) => {
        const processTerminatedPrematurely = !this.isProcessTerminationInProgress && (code !== 0 || !!signal);
        const processCommand = `${command} ${processArguments.join(" ")}`;
        const terminatedPid = this.process?.pid;

        this.logger.debug(
          `Process ${processTerminatedPrematurely ? "terminated prematurely" : "exited normally"} ` +
          `with code '${code}' and signal '${signal}' ` +
          `for command: ${processCommand}`);

        if (processTerminatedPrematurely && terminatedPid !== undefined) {
          await this.kill();
          runOptions?.prematureTerminationHandler?.(terminatedPid);
        } else {
          this.updateProcessEnded();
        }

        resolve();
      });
    });

    return this.futureTermination;
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
    await new Promise<void>(resolve => {
      if (!this.isProcessRunning()) {
        this.logger.info(`Request to kill process - Process is not running`);
        resolve();
        return;
      }

      const processPid = this.process!.pid;
      this.isProcessTerminationInProgress = true;

      treeKill(processPid, "SIGKILL", () => {
        this.updateProcessEnded();
        this.logger.info(`Succesfully killed process PID: ${processPid}`);
        this.isProcessTerminationInProgress = false;
        resolve();
      });
    });
  }

  private setupProcessOutputs() {
    this.process?.stdout?.on("data", (data: any) => {
      this.logger.info(`${data.toString()}`);
      /*
      const { isTestRunning } = this.karmaEventListener;
      const regex = new RegExp(/\(.*?)\m/, "g");
      if (isTestRunning) {
        let log = data.toString().replace(regex, "");
        if (log.startsWith("e ")) {
          log = "HeadlessChrom" + log;
        }
        this.logger.info(`${log}`, { divider: "Karma Logs" });
      }
      */
    });

    this.process?.stderr?.on("data", (data: any) => this.logger.error(`stderr: ${data}`));
    this.process?.on("error", (err: any) => this.logger.error(`error from child process: ${err}`));

    // Prevent karma server from being an orphan process.
    // For example, if VSCODE is killed using SIGKILL, karma server will still be alive.
    // When VSCODE is terminated, karma server's standard input is closed automatically.
    this.process?.stdin?.on("close", async () => {
      // terminating orphan process
      if (this.isProcessRunning()) {
        this.kill();
      }
    });
  }

  private updateProcessEnded() {
    this.process = undefined;
  }
}
