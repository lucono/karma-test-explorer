import { LogAppender } from '../../../util/logging/log-appender';
import { CommandLineProcessLog } from '../../../util/process/command-line-process-log';

export class KarmaServerProcessLog implements CommandLineProcessLog {
  public constructor(private readonly logOutput: LogAppender) {}

  public output(data: () => string) {
    this.logOutput.append(this.formatMessage(data()));
  }

  public error(data: () => string) {
    this.logOutput.append(`[stderr]: ${this.formatMessage(data())}`);
  }

  private formatMessage(data: string): string {
    const log = data
      .toString()
      .replace(/\(.*?)\m/g, '')
      .replace(/(^|\n)e Headless /g, '$1Chrome Headless ')
      .replace(/(^|\n)e ([^H])/g, '$1HeadlessChrome $2');

    return log;
  }
}
