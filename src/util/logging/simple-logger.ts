import { DEFAULT_LOG_LEVEL } from '../../constants';
import { Disposable } from '../disposable/disposable';
import { Disposer } from '../disposable/disposer';
import { LogAppender } from './log-appender';
import { LogLevel } from './log-level';
import { Logger } from './logger';

export class SimpleLogger implements Logger {
  private readonly appender: LogAppender;
  private readonly disposables: Disposable[] = [];
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
    if (this.isLevelEnabled(LogLevel.ERROR)) {
      this.log(LogLevel.ERROR, msgSource());
    }
  }

  public warn(msgSource: () => string) {
    if (this.isLevelEnabled(LogLevel.WARN)) {
      this.log(LogLevel.WARN, msgSource());
    }
  }

  public info(msgSource: () => string) {
    if (this.isLevelEnabled(LogLevel.INFO)) {
      this.log(LogLevel.INFO, msgSource());
    }
  }

  public debug(msgSource: () => string) {
    if (this.isLevelEnabled(LogLevel.DEBUG)) {
      this.log(LogLevel.DEBUG, msgSource());
    }
  }

  public trace(msgSource: () => string) {
    if (this.isLevelEnabled(LogLevel.TRACE)) {
      this.log(LogLevel.TRACE, msgSource());
    }
  }

  private isLevelEnabled(logLevel: LogLevel): boolean {
    return logLevel <= this.logLevel;
  }

  private log(logLevel: LogLevel, msg: string): void {
    const timeStamp = new Date().toISOString().replace('T', ' ').replace('Z', '');
    const logLevelLabel = LogLevel[logLevel];
    const loggerNameDecoration = this.loggerName ? ` [${this.loggerName}]` : '';
    this.appender.append(`[${timeStamp}] [${logLevelLabel}]${loggerNameDecoration}: ${msg}`);
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
