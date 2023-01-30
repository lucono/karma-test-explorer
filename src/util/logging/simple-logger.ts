import { DEFAULT_LOG_LEVEL } from '../../constants.js';
import { getPropertyWithValue } from '../utils.js';
import { LogAppender } from './log-appender.js';
import { LogLevel, LogLevels } from './log-level.js';
import { Logger } from './logger.js';

export class SimpleLogger implements Logger {
  private readonly appender: LogAppender;
  private readonly logLevel: LogLevel;

  public constructor(logger: SimpleLogger | LogAppender, private readonly loggerName: string, logLevel?: LogLevel) {
    if (logger instanceof SimpleLogger) {
      this.appender = logger.appender;
    } else {
      this.appender = logger;
    }
    this.appender = logger instanceof SimpleLogger ? logger.appender : logger;
    this.logLevel = logLevel ?? (logger instanceof SimpleLogger ? logger.logLevel : DEFAULT_LOG_LEVEL);
  }

  public error(msgSource: () => string) {
    this.log(LogLevel.ERROR, msgSource);
  }

  public warn(msgSource: () => string) {
    this.log(LogLevel.WARN, msgSource);
  }

  public info(msgSource: () => string) {
    this.log(LogLevel.INFO, msgSource);
  }

  public debug(msgSource: () => string) {
    this.log(LogLevel.DEBUG, msgSource);
  }

  public trace(msgSource: () => string) {
    this.log(LogLevel.TRACE, msgSource);
  }

  private log(logLevel: LogLevel, msgSource: () => string): void {
    if (!this.isLevelEnabled(logLevel)) {
      return;
    }
    const logMessage = msgSource();
    const timeStamp = new Date().toISOString().replace('T', ' ').replace('Z', '');
    const logLevelLabel = getPropertyWithValue(LogLevel, logLevel) || 'LOG';
    const loggerNameDecoration = this.loggerName ? ` [${this.loggerName}]` : '';
    this.appender.append(`[${timeStamp}] [${logLevelLabel}]${loggerNameDecoration}: ${logMessage}`);
  }

  private isLevelEnabled(logLevel: LogLevel): boolean {
    return LogLevels[this.logLevel] >= LogLevels[logLevel];
  }

  public async dispose() {
    // Nothing to dispose
  }
}
