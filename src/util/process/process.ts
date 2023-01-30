import { Disposable } from '../disposable/disposable.js';
import { Execution } from '../future/execution.js';

export interface Process<S = void, E = void> extends Disposable {
  execution(): Execution<S, E>;
  stop(): Promise<E>;
  kill(): Promise<void>;
}
