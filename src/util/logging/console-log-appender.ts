import { LogAppender } from './log-appender';

export interface ConsoleLog {
  log(content: string): void;
}

export class ConsoleLogAppender implements LogAppender {
  private readonly consoleLog: ConsoleLog;

  public constructor(consoleLog?: ConsoleLog) {
    this.consoleLog = consoleLog ?? console;
  }

  public append(content: string): void {
    this.consoleLog.log(content);
  }

  public dispose() {
    // Nothing to do
  }
}
