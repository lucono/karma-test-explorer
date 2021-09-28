import RichPromise from 'bluebird';
import { Disposable } from './disposable';

export class Disposer {
  public static async dispose(...disposables: ((Disposable | undefined)[] | Disposable | undefined)[]): Promise<void> {
    await RichPromise.allSettled(disposables.map(disposable => this.disposeItems(disposable)));
  }

  private static async disposeItems(disposables: Disposable | undefined | (Disposable | undefined)[]): Promise<void> {
    if (!disposables) {
      return;
    }

    if (!Array.isArray(disposables)) {
      try {
        await disposables.dispose();
      } catch (error) {
        throw new Error(`Failed while disposing instance of ${disposables.constructor.name}: ${error}`);
      }
      return;
    }

    const distinctDisposables = new Set(disposables.filter(disposable => !!disposable)) as Set<Disposable>;

    if (distinctDisposables.size === 0) {
      return;
    }
    const diposals = Array.from(distinctDisposables).map(disposable => this.disposeItems(disposable));
    disposables.splice(0, disposables.length);

    await RichPromise.allSettled(diposals);
  }
}
