import RichPromise from 'bluebird';
import { Disposable } from '../disposable/disposable';
import { Disposer } from '../disposable/disposer';
import { SimpleLogger } from '../logging/simple-logger';
import { Process } from './process';
import { SimpleProcess, SimpleProcessOptions } from './simple-process';

export interface ProcessHandlerOptions {
  defaultProcessOptions?: SimpleProcessOptions;
}

export class ProcessHandler implements Disposable {
  private readonly processes: Set<Process> = new Set();
  private readonly disposables: Disposable[] = [];

  public constructor(private readonly logger: SimpleLogger, private readonly options?: ProcessHandlerOptions) {
    this.disposables.push(logger);
  }

  public spawn(command: string, processArguments: string[], options?: SimpleProcessOptions): Process {
    const loggerParentProcessLabel = options?.parentProcessName ? `${options.parentProcessName}::` : '';
    const processLogger = new SimpleLogger(this.logger, `${loggerParentProcessLabel}${SimpleProcess.name}`);
    const processOptions = { ...this.options?.defaultProcessOptions, ...options };
    const process: Process = new SimpleProcess(command, processArguments, processLogger, processOptions);

    this.processes.add(process);

    process
      .execution()
      .done()
      .then(() => this.processes.delete(process));

    return process;
  }

  public async stopAll() {
    const processTerminations = [...this.processes].map(process => process.stop());
    await RichPromise.allSettled(processTerminations);
  }

  public async killAll() {
    const processTerminations = [...this.processes].map(process => process.kill());
    await RichPromise.allSettled(processTerminations);
  }

  public async dispose(): Promise<void> {
    return Disposer.dispose(this.disposables);
  }
}
