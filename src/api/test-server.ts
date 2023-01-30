import { Disposable } from '../util/disposable/disposable.js';
import { Execution } from '../util/future/execution.js';

export interface TestServer extends Disposable {
  start(karmaPort: number, karmaSocketPort: number, debugPort?: number): Execution;

  stop(): Promise<void>;

  isRunning(): boolean;

  getServerPort(): number | undefined;
}
