
export interface Execution<S = void, T = void> {
  readonly started: Promise<T>;  // FIXME: make method
  readonly stopped: Promise<S>;  // FIXME: make method
}
