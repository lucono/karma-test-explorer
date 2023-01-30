import { LogAppender } from '../../../util/logging/log-appender.js';
import { ProcessLog } from '../../../util/process/process-log.js';

export class KarmaServerProcessLog implements ProcessLog {
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
