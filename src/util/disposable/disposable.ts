export interface Disposable {
  dispose(): Promise<void> | void;
}

export type NonDisposable<T extends Disposable> = Omit<T, 'dispose'>;
