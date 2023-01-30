import { NonDisposable } from '../disposable/disposable.js';
import { Logger } from './logger.js';

export class MultiLogger implements Logger {
  private readonly loggers: (NonDisposable<Logger> | undefined)[];

  public constructor(...loggers: (NonDisposable<Logger> | undefined)[]) {
    this.loggers = loggers;
  }

  public error(provideMessage: () => string): void {
    this.loggers.forEach(logger => logger?.error(provideMessage));
  }

  public warn(provideMessage: () => string): void {
    this.loggers.forEach(logger => logger?.warn(provideMessage));
  }

  public info(provideMessage: () => string): void {
    this.loggers.forEach(logger => logger?.info(provideMessage));
  }

  public debug(provideMessage: () => string): void {
    this.loggers.forEach(logger => logger?.debug(provideMessage));
  }

  public trace(provideMessage: () => string): void {
    this.loggers.forEach(logger => logger?.trace(provideMessage));
  }

  public dispose(): void | Promise<void> {
    // Underlying loggers are not owned or disposed by multi logger
  }
}
