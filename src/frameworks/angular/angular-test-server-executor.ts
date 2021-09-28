import { SpawnOptions } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { silent } from 'resolve-global';
import { ServerStopExecutor, TestServerExecutor } from '../../api/test-server-executor';
import { Disposable } from '../../util/disposable/disposable';
import { Disposer } from '../../util/disposable/disposer';
import { DeferredExecution } from '../../util/future/deferred-execution';
import { Execution } from '../../util/future/execution';
import { SimpleLogger } from '../../util/logging/simple-logger';
import { CommandLineProcessHandler } from '../../util/process/command-line-process-handler';
import { CommandLineProcessLog } from '../../util/process/command-line-process-log';
import { KarmaEnvironmentVariable } from '../karma/karma-environment-variable';
import { AngularProject } from './angular-project';

export interface AngularTestServerExecutorOptions {
  environment?: Record<string, string | undefined>;
  angularProcessCommand?: string;
  serverProcessLog?: CommandLineProcessLog;
}

export class AngularTestServerExecutor implements TestServerExecutor {
  private readonly disposables: Disposable[] = [];

  public constructor(
    private readonly angularProject: AngularProject,
    private readonly workspaceRootPath: string,
    private readonly baseKarmaConfigFile: string,
    private readonly logger: SimpleLogger,
    private readonly options: AngularTestServerExecutorOptions = {}
  ) {}

  public executeServerStart(
    karmaPort: number,
    karmaSocketPort: number,
    debugPort?: number
  ): Execution<ServerStopExecutor> {
    this.logger.debug(
      () => `Executing server start with karma port '${karmaPort}' and karma socket port '${karmaSocketPort}'`
    );

    const deferredServerExecution = new DeferredExecution<ServerStopExecutor>();

    const environment: Record<string, string> = {
      ...this.options?.environment,
      [KarmaEnvironmentVariable.UserKarmaConfigPath]: this.angularProject.karmaConfigPath,
      [KarmaEnvironmentVariable.KarmaPort]: `${karmaPort}`,
      [KarmaEnvironmentVariable.KarmaSocketPort]: `${karmaSocketPort}`
    };

    if (debugPort !== undefined) {
      environment[KarmaEnvironmentVariable.DebugPort] = `${debugPort}`;
    }

    const spawnOptions: SpawnOptions = {
      cwd: this.angularProject.rootPath,
      shell: true,
      env: environment
    };

    const angularProcessCommand = this.options.angularProcessCommand;
    const localAngularPath = join(this.workspaceRootPath, 'node_modules', '@angular', 'cli', 'bin', 'ng');
    const isAngularInstalledLocally = existsSync(localAngularPath);
    const isAngularInstalledGlobally = silent('@angular/cli') !== undefined;

    let command: string;
    let processArguments: string[] = [];

    if (angularProcessCommand) {
      command = angularProcessCommand;
    } else if (isAngularInstalledLocally) {
      command = 'npx';
      processArguments.push('ng');
    } else if (isAngularInstalledGlobally) {
      command = 'ng';
    } else {
      const errorMessage = '@angular/cli does not seem to be installed. Please install it and try again.';
      this.logger.error(() => errorMessage);
      deferredServerExecution.fail(errorMessage);
      return deferredServerExecution.execution();
    }

    processArguments = [
      ...processArguments,
      'test',
      this.angularProject.name,
      `--karma-config=${this.baseKarmaConfigFile}`,
      '--progress=false',
      '--no-watch'
    ];

    const angularProcess = new CommandLineProcessHandler(
      command,
      processArguments,
      new SimpleLogger(this.logger, CommandLineProcessHandler.name),
      this.options.serverProcessLog,
      spawnOptions
    );
    this.disposables.push(angularProcess);

    const serverStopper: ServerStopExecutor = {
      executeServerStop: async () => angularProcess.stop()
    };

    angularProcess
      .execution()
      .started()
      .then(() => deferredServerExecution.start(serverStopper));

    angularProcess
      .execution()
      .ended()
      .then(() => deferredServerExecution.end());

    return deferredServerExecution.execution();
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
