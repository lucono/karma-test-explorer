export interface Execution<S = void, T = void> {

  readonly started: () => Promise<S>;

  readonly stopped: () => Promise<T>;
}
