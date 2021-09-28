import { Disposable } from '../util/disposable/disposable';
import { Execution } from '../util/future/execution';

export interface TestServerExecutor extends Disposable {
  executeServerStart(karmaPort: number, karmaSocketPort: number, debugPort?: number): Execution<ServerStopExecutor>;
}

export interface ServerStopExecutor {
  executeServerStop(): Promise<void>;
}
