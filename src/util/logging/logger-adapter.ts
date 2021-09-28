import { BasicLog } from './basic-log';
import { LogLevel } from './log-level';
import { Logger } from './logger';

export class LoggerAdapter implements Logger {
  private constructor(private readonly logger: BasicLog, private readonly logLevel: LogLevel) {}

  public static fromBasicLog(log: BasicLog, logLevel: LogLevel): LoggerAdapter {
    return new LoggerAdapter(log, logLevel);
  }

  public error(msgSource: () => string) {
    if (this.isLevelEnabled(LogLevel.ERROR)) {
      this.logger.error(msgSource());
    }
  }

  public warn(msgSource: () => string) {
    if (this.isLevelEnabled(LogLevel.WARN)) {
      this.logger.warn(msgSource());
    }
  }

  public info(msgSource: () => string) {
    if (this.isLevelEnabled(LogLevel.INFO)) {
      this.logger.info(msgSource());
    }
  }

  public debug(msgSource: () => string) {
    if (this.isLevelEnabled(LogLevel.DEBUG)) {
      this.logger.debug(msgSource());
    }
  }

  public trace(msgSource: () => string) {
    if (this.isLevelEnabled(LogLevel.TRACE)) {
      (this.logger.trace ?? this.logger.debug).apply(this.logger, [msgSource()]);
    }
  }

  private isLevelEnabled(logLevel: LogLevel): boolean {
    return logLevel <= this.logLevel;
  }

  public dispose(): void {
    this.logger.dispose();
  }
}
