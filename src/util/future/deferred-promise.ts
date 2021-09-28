import RichPromise from 'bluebird';

type PromiseResolver<T> = (value: T | PromiseLike<T>) => void;
type PromiseRejector = (reason?: any) => void;

export class DeferredPromise<T = void> {
  private readonly promiseInstance: RichPromise<T>;
  private readonly fulfiller: PromiseResolver<T>;
  private readonly rejector: PromiseRejector;

  public constructor() {
    let promiseFulfiller: PromiseResolver<T> | undefined;
    let promiseRejector: PromiseRejector | undefined;

    this.promiseInstance = new RichPromise<T>((fulfill, reject) => {
      promiseFulfiller = fulfill;
      promiseRejector = reject;
    });

    this.fulfiller = (value: T | PromiseLike<T>) => promiseFulfiller!(value);
    this.rejector = (reason?: any) => promiseRejector!(reason);
  }

  public promise(): RichPromise<T> {
    return this.promiseInstance;
  }

  public fulfill(value: T): void {
    this.fulfiller(value);
  }

  public reject(reason?: any): void {
    this.rejector(reason);
  }

  public autoFulfill(delay: number, value: T): void {
    if (!this.promiseInstance.isResolved()) {
      setTimeout(() => this.fulfill(value), delay);
    }
  }

  public autoReject(delay: number, reason?: any): void {
    if (!this.promiseInstance.isResolved()) {
      setTimeout(() => this.reject(reason), delay);
    }
  }
}
