import { DeferredPromise } from './deferred-promise';
import { Execution } from './execution';

export class DeferredExecution<S = void, T = void> {
  private readonly deferredExecutionStart: DeferredPromise<S>;
  private readonly deferredExecutionEnd: DeferredPromise<T>;
  private readonly executionInstance: Execution<S, T>;

  public constructor() {
    this.deferredExecutionStart = new DeferredPromise<S>();
    this.deferredExecutionEnd = new DeferredPromise<T>();

    this.executionInstance = new Execution(this.deferredExecutionStart.promise(), this.deferredExecutionEnd.promise());
  }

  public execution(): Execution<S, T> {
    return this.executionInstance;
  }

  public start(value: S) {
    if (!this.deferredExecutionStart.promise().isResolved()) {
      this.deferredExecutionStart.fulfill(value);
    }
  }

  public end(value: T) {
    if (this.executionInstance.isStarted()) {
      this.deferredExecutionEnd.fulfill(value);
    }
  }

  public fail(reason: any) {
    const currentExecutionPhase = !this.deferredExecutionStart.promise().isResolved()
      ? this.deferredExecutionStart
      : this.executionInstance.isStarted()
      ? this.deferredExecutionEnd
      : undefined;

    if (currentExecutionPhase) {
      currentExecutionPhase.reject(reason);
    }
  }

  public autoStart(delay: number, value: S): void {
    if (delay > 0) {
      setTimeout(() => this.start(value), delay);
    } else {
      this.start(value);
    }
  }

  public autoEnd(delay: number, value: T): void {
    if (delay > 0) {
      setTimeout(() => this.end(value), delay);
    } else {
      this.end(value);
    }
  }

  public failIfNotStarted(delay: number, reason: any): void {
    const failStart = () => {
      if (!this.deferredExecutionStart.promise().isResolved()) {
        this.fail(reason);
      }
    };

    if (delay > 0) {
      setTimeout(failStart, delay);
    } else {
      failStart();
    }
  }

  public failIfNotEnded(delay: number, reason: any): void {
    if (delay > 0) {
      setTimeout(() => this.fail(reason), delay);
    } else {
      this.fail(reason);
    }
  }
}
