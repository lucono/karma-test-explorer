
// export interface Execution<T = void, U = void> {
//   executionStarted: Promise<T>
//   executionEnded: Promise<U>
// }

export interface Execution<S = void, T = void> {
  started: Promise<T>;
  stopped: Promise<S>;
  // executionData?: U  // FIXME: Currently not used
}
