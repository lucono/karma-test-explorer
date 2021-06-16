
// export type KarmaServerProcessLogger = (data: string, karmaServerPort: number) => void;

import { OutputChannel } from "vscode";
import { CommandLineProcessLog } from "../../../util/commandline-process-handler";

export class KarmaServerProcessLog implements CommandLineProcessLog {
    public constructor(private readonly logOutput: OutputChannel) {}
    
    public output(data: string) {
        this.logOutput.append(this.formatMessage(data));
    }
    
    public error(data: string) {
        const logMessage = this.formatMessage(data);
        this.output(`stderr: ${logMessage}`);
    }

    private formatMessage(data: string): string {
    const regex = new RegExp(/\(.*?)\m/, "g");

    // if (testManager?.isTestRunning()) {  // FIXME: This doesn't seem to be logging Karma output as expected
      let log = data.toString().replace(regex, "");
      if (log.startsWith("e ")) {
        log = `HeadlessChrom${log}`;
      }
      // serverProcessLogger.info(`${log}`, { divider: `Karma Server:${serverPort} Logs` });
    //   this.karmaOutputChannel.append(`\n\n[karma:${serverPort}] ${data}`);
      return log;
    // }
  }
}