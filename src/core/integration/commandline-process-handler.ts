import { KarmaEventListener } from "./karma-event-listener";
import { SpawnOptions } from "child_process";
import { Logger } from "../helpers/logger";
const spawn = require("cross-spawn");
export class CommandlineProcessHandler {
  private process: any;
  public constructor(private readonly karmaEventListener: KarmaEventListener, private readonly logger: Logger) {}

  public create(command: string, processArguments: string[], options: SpawnOptions): Promise<any> {
    return new Promise(resolve => {
      if (this.process) {
        this.kill();
        this.updateProcessEnded();
      }

      this.logger.info(
        `Executing command: '${command}'`,
        `with args: ${JSON.stringify(processArguments)}`,
        `and options: ${JSON.stringify(options)}`
      );

      this.process = spawn(command, processArguments, options);
      this.setupProcessOutputs();
      this.process.on("exit", () => {
        this.updateProcessEnded();
        resolve();
      });
    });
  }

  public isProcessRunning(): boolean {
    return this.process !== undefined;
  }

  private updateProcessEnded() {
    this.process = undefined;
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

  public kill(): void {
    const kill = require("tree-kill");
    kill(this.process.pid, "SIGKILL");
    this.updateProcessEnded();
  }

  private setupProcessOutputs() {
    this.process.stdout.on("data", (data: any) => {
      const { isTestRunning } = this.karmaEventListener;
      const regex = new RegExp(/\(.*?)\m/, "g");
      if (isTestRunning) {
        let log = data.toString().replace(regex, "");
        if (log.startsWith("e ")) {
          log = "HeadlessChrom" + log;
        }
        this.logger.info(`${log}`, { divider: "Karma Logs" });
      }
    });
    this.process.stderr.on("data", (data: any) => this.logger.error(`stderr: ${data}`));
    this.process.on("error", (err: any) => this.logger.error(`error from child process: ${err}`));

    // Prevent karma server from being an orphan process.
    // For example, if VSCODE is killed using SIGKILL, karma server will still be alive.
    // When VSCODE is terminated, karma server's standard input is closed automatically.
    process.stdin.on("close", async () => {
      // terminating orphan process
      this.kill();
    });
  }
}
