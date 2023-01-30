import { Disposable } from '../util/disposable/disposable.js';
import { Execution } from '../util/future/execution.js';

export interface TestRunExecutor extends Disposable {
  executeTestRun(karmaPort: number, clientArgs: string[]): Execution;
}
