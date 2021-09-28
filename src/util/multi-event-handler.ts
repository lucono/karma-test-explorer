import { Disposable } from './disposable/disposable';
import { Disposer } from './disposable/disposer';
import { Logger } from './logging/logger';

export class MultiEventHandler<E = string, T extends (...args: any[]) => any = (...args: unknown[]) => unknown>
  implements Disposable
{
  private readonly eventHandlers: Map<E, T> = new Map();
  private defaultHandler?: T;
  private errorHandler?: (event: E, error: any, ...eventArgs: Parameters<T>) => void;
  private disposables: Disposable[] = [];

  public constructor(private readonly logger: Logger) {
    this.disposables.push(logger);
  }

  public handleEvent(event: E, ...args: Parameters<T>): ReturnType<T> | undefined {
    const eventHandler = this.eventHandlers.get(event);
    let result: ReturnType<T> | undefined;

    try {
      if (eventHandler) {
        this.logger.trace(() => `Using assigned handler for received event: ${event}`);
        result = eventHandler(...args);
      } else if (this.defaultHandler) {
        this.logger.trace(() => `Using default handler for received event with no assigned handler: ${event}`);
        result = this.defaultHandler(...args);
      } else {
        this.logger.warn(() => `Skipping event with no assigned or default handler: ${event}`);
      }
    } catch (error) {
      if (this.errorHandler) {
        this.errorHandler(event, error, ...args);
      }
    }
    return result;
  }

  public setEventHandler(event: E | E[], handler: T) {
    const events = Array.isArray(event) ? event : [event];
    events.forEach(eventItem => this.eventHandlers.set(eventItem, handler));
  }

  public clearEventHandler(event: E) {
    this.eventHandlers.delete(event);
  }

  public setDefaultHandler(handler: T) {
    this.defaultHandler = handler;
  }

  public clearDefaultHandler() {
    this.defaultHandler = undefined;
  }

  public setErrorHandler(errorHandler: (event: E, error: any, ...eventArgs: Parameters<T>) => void) {
    this.errorHandler = errorHandler;
  }

  public clearErrorHandler() {
    this.errorHandler = undefined;
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
