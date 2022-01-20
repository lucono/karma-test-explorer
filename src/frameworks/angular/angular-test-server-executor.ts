import { join } from 'path';
import { ServerStopExecutor, TestServerExecutor } from '../../api/test-server-executor';
import { Disposable } from '../../util/disposable/disposable';
import { Disposer } from '../../util/disposable/disposer';
import { DeferredExecution } from '../../util/future/deferred-execution';
import { Execution } from '../../util/future/execution';
import { SimpleLogger } from '../../util/logging/simple-logger';
import {
  CommandLineProcessHandler,
  CommandLineProcessHandlerOptions
} from '../../util/process/command-line-process-handler';
import { CommandLineProcessLog } from '../../util/process/command-line-process-log';
import { getNodeExecutablePath, getPackageInstallPathForProjectRoot } from '../../util/utils';
import { KarmaEnvironmentVariable } from '../karma/karma-environment-variable';
import { AngularProject } from './angular-project';

export interface AngularTestServerExecutorOptions {
  environment?: Record<string, string | undefined>;
  angularProcessCommand?: string;
  serverProcessLog?: CommandLineProcessLog;
  failOnStandardError?: boolean;
  allowGlobalPackageFallback?: boolean;
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

    const runOptions: CommandLineProcessHandlerOptions = {
      cwd: this.angularProject.rootPath,
      shell: false,
      env: environment,
      failOnStandardError: this.options.failOnStandardError
    };

    const angularLocalInstallPath = getPackageInstallPathForProjectRoot(
      '@angular/cli',
      this.workspaceRootPath,
      { allowGlobalPackageFallback: this.options.allowGlobalPackageFallback },
      this.logger
    );
    const angularBinaryPath = angularLocalInstallPath ? join(angularLocalInstallPath, 'bin', 'ng') : undefined;

    if (!angularBinaryPath) {
      throw new Error(
        `Angular CLI does not seem to be installed - ` +
          `You may need to run 'npm install' in your project. ` +
          `Please install it and try again.`
      );
    }

    const nodeExecutablePath = getNodeExecutablePath(this.options.environment?.PATH);

    let command: string;
    let processArguments: string[] = [];

    if (this.options.angularProcessCommand) {
      command = this.options.angularProcessCommand;
    } else {
      command = nodeExecutablePath ?? process.execPath;
      processArguments = [angularBinaryPath];
    }

    processArguments = [
      ...processArguments,
      'test',
      this.angularProject.name,
      `--karma-config=${this.baseKarmaConfigFile}`,
      '--progress=false',
      '--no-watch'
    ];

    const commandLineProcessLogger = new SimpleLogger(
      this.logger,
      `${AngularTestServerExecutor.name}::${CommandLineProcessHandler.name}`
    );

    const angularProcess = new CommandLineProcessHandler(
      command,
      processArguments,
      commandLineProcessLogger,
      this.options.serverProcessLog,
      runOptions
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

    angularProcess
      .execution()
      .failed()
      .then(reason => deferredServerExecution.fail(reason));

    return deferredServerExecution.execution();
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
