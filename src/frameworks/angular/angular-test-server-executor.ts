import { join } from 'path';
import { TestServerExecutor } from '../../api/test-server-executor';
import { Disposable } from '../../util/disposable/disposable';
import { Disposer } from '../../util/disposable/disposer';
import { SimpleLogger } from '../../util/logging/simple-logger';
import { Process } from '../../util/process/process';
import { ProcessHandler } from '../../util/process/process-handler';
import { ProcessLog } from '../../util/process/process-log';
import { SimpleProcessOptions } from '../../util/process/simple-process';
import { getNodeExecutablePath, getPackageInstallPathForProjectRoot } from '../../util/utils';
import { KarmaEnvironmentVariable } from '../karma/karma-environment-variable';
import { AngularProject } from './angular-project';

export interface AngularTestServerExecutorOptions {
  environment?: Record<string, string | undefined>;
  angularProcessCommand?: string;
  serverProcessLog?: ProcessLog;
  failOnStandardError?: boolean;
  allowGlobalPackageFallback?: boolean;
}

export class AngularTestServerExecutor implements TestServerExecutor {
  private readonly disposables: Disposable[] = [];

  public constructor(
    private readonly angularProject: AngularProject,
    private readonly workspaceRootPath: string,
    private readonly baseKarmaConfigFile: string,
    private readonly processHandler: ProcessHandler,
    private readonly logger: SimpleLogger,
    private readonly options: AngularTestServerExecutorOptions = {}
  ) {}

  public executeServerStart(karmaPort: number, karmaSocketPort: number, debugPort?: number): Process {
    this.logger.debug(
      () => `Executing server start with karma port '${karmaPort}' and karma socket port '${karmaSocketPort}'`
    );

    const environment: Record<string, string> = {
      ...this.options?.environment,
      [KarmaEnvironmentVariable.UserKarmaConfigPath]: this.angularProject.karmaConfigPath,
      [KarmaEnvironmentVariable.KarmaPort]: `${karmaPort}`,
      [KarmaEnvironmentVariable.KarmaSocketPort]: `${karmaSocketPort}`
    };

    if (debugPort !== undefined) {
      environment[KarmaEnvironmentVariable.DebugPort] = `${debugPort}`;
    }

    const runOptions: SimpleProcessOptions = {
      cwd: this.angularProject.rootPath,
      shell: false,
      env: environment,
      failOnStandardError: this.options.failOnStandardError,
      parentProcessName: AngularTestServerExecutor.name,
      processLog: this.options.serverProcessLog
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

    const angularProcess = this.processHandler.spawn(command, processArguments, runOptions);
    this.disposables.push(angularProcess);

    return angularProcess;
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
