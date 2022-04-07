import { Disposable } from '../disposable/disposable';
import { Execution } from '../future/execution';

export interface Process<S = void, E = void> extends Disposable {
  execution(): Execution<S, E>;
  stop(): Promise<E>;
  kill(): Promise<void>;
}
