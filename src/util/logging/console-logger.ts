import { ConsoleLogAppender } from './console-log-appender.js';
import { LogLevel } from './log-level.js';
import { SimpleLogger } from './simple-logger.js';

export class ConsoleLogger extends SimpleLogger {
  public constructor(loggerName: string, logLevel?: LogLevel) {
    super(new ConsoleLogAppender(), loggerName, logLevel);
  }
}
