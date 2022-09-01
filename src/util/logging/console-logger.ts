import { ConsoleLogAppender } from './console-log-appender';
import { LogLevel } from './log-level';
import { SimpleLogger } from './simple-logger';

export class ConsoleLogger extends SimpleLogger {
  public constructor(loggerName: string, logLevel?: LogLevel) {
    super(new ConsoleLogAppender(), loggerName, logLevel);
  }
}
