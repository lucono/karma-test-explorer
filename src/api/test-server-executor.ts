import { Disposable } from '../util/disposable/disposable';
import { Process } from '../util/process/process';

export interface TestServerExecutor extends Disposable {
  executeServerStart(karmaPort: number, karmaSocketPort: number, debugPort?: number): Process;
}
