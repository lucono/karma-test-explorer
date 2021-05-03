
// export interface Execution<T = void, U = void> {
//   executionStarted: Promise<T>
//   executionEnded: Promise<U>
// }

export interface Execution<T = void, U = void> {
  onStart?: Promise<T>,
  onStop: Promise<U>
}

export interface PromiseExecutor<T> {
  resolve: (value: T) => void,
  reject: (reason?: any) => void
}
