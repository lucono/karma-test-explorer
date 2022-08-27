import { BasicLog } from './basic-log';
import { LogLevel, LogLevels } from './log-level';
import { Logger } from './logger';

export interface LoggerAdapterOptions {
  patchTraceLogger?: boolean;
}

export class LoggerAdapter implements Logger {
  private options: Required<LoggerAdapterOptions>;

  private constructor(
    private readonly logger: BasicLog,
    private readonly logLevel: LogLevel,
    options?: LoggerAdapterOptions
  ) {
    this.options = { patchTraceLogger: false, ...options };
  }

  public static fromBasicLog(log: BasicLog, logLevel: LogLevel, options?: LoggerAdapterOptions): LoggerAdapter {
    return new LoggerAdapter(log, logLevel, options);
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
    if (!this.isLevelEnabled(LogLevel.TRACE)) {
      return;
    }
    if (!this.options.patchTraceLogger && typeof this.logger.trace === 'function') {
      this.logger.trace(msgSource());
    } else {
      this.logger.debug(`[TRACE]: ${msgSource()}`);
    }
  }

  private isLevelEnabled(logLevel: LogLevel): boolean {
    return LogLevels[this.logLevel] >= LogLevels[logLevel];
  }

  public dispose(): void {
    this.logger.dispose();
  }
}
