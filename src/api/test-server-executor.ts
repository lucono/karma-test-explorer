import { Disposable } from '../util/disposable/disposable.js';
import { Process } from '../util/process/process.js';

export interface TestServerExecutor extends Disposable {
  executeServerStart(karmaPort: number, karmaSocketPort: number, debugPort?: number): Process;
}
