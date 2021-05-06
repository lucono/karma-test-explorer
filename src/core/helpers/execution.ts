
// export interface Execution<T = void, U = void> {
//   executionStarted: Promise<T>
//   executionEnded: Promise<U>
// }

export interface Execution<S = void, T = void, U = void> {
  stopped: Promise<S>,
  started?: Promise<T>,
  executionData?: U  // FIXME: Currently not used
}

export interface PromiseExecutor<T> {
  resolve(value: T): void,
  reject(reason?: any): void
}
