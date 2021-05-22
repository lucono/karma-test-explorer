export interface Execution<S = void, T = void> {
  readonly started: () => Promise<S>;  // FIXME: make method
  readonly stopped: () => Promise<T>;  // FIXME: make method
}
