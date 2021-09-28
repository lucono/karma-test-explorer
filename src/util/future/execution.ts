import RichPromise from 'bluebird';

export class Execution<S = void, T = void> {
  public constructor(private readonly futureStart: RichPromise<S>, private readonly futureEnd: RichPromise<T>) {}

  public started(): RichPromise<S> {
    return this.futureStart;
  }

  public ended(): RichPromise<T> {
    return this.futureEnd;
  }

  public failed(): RichPromise<any> {
    return new RichPromise<any>(resolve => {
      this.futureStart.catch(reason => resolve(reason));
      this.futureEnd.catch(reason => resolve(reason));
    });
  }

  public done(): RichPromise<any> {
    return new RichPromise<any>(resolve => {
      this.futureStart.catch(reason => resolve(reason));
      this.futureEnd.catch(reason => resolve(reason));
      this.futureEnd.then(value => resolve(value));
    });
  }

  public isStarted(): boolean {
    return this.futureStart.isResolved() && !this.futureEnd.isResolved();
  }

  public isEnded(): boolean {
    return this.futureEnd.isResolved();
  }

  public isFailed(): boolean {
    return this.futureStart.isRejected() || this.futureEnd.isRejected();
  }

  public isDone(): boolean {
    return this.isEnded() || this.isFailed();
  }
}
