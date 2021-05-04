
// export interface Execution<T = void, U = void> {
//   executionStarted: Promise<T>
//   executionEnded: Promise<U>
// }

export interface Execution<S = void, T = void, U = void> {
  executionData?: S,  // FIXME: Currently not used
  onStart?: Promise<T>,
  onStop: Promise<U>
}

export interface PromiseExecutor<T> {
  resolve: (value: T) => void,
  reject: (reason?: any) => void
}
