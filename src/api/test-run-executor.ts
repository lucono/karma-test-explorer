import { Disposable } from '../util/disposable/disposable';
import { Execution } from '../util/future/execution';

export interface TestRunExecutor extends Disposable {
  executeTestRun(karmaPort: number, clientArgs: string[]): Execution;
}
