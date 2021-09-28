import { Disposable } from '../util/disposable/disposable';
import { Execution } from '../util/future/execution';

export interface TestServer extends Disposable {
  start(karmaPort: number, karmaSocketPort: number, debugPort?: number): Execution;

  stop(): Promise<void>;

  isRunning(): boolean;

  getServerPort(): number | undefined;
}
