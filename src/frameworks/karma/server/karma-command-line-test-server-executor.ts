import { join } from 'path';
import { TestServerExecutor } from '../../../api/test-server-executor';
import { Disposable } from '../../../util/disposable/disposable';
import { Disposer } from '../../../util/disposable/disposer';
import { SimpleLogger } from '../../../util/logging/simple-logger';
import { Process } from '../../../util/process/process';
import { ProcessHandler } from '../../../util/process/process-handler';
import { ProcessLog } from '../../../util/process/process-log';
import { SimpleProcessOptions } from '../../../util/process/simple-process';
import { getNodeExecutablePath, getPackageInstallPathForProjectRoot } from '../../../util/utils';
import { KarmaEnvironmentVariable } from '../karma-environment-variable';

export interface KarmaCommandLineTestServerExecutorOptions {
  environment: { readonly [key: string]: string | undefined };
  karmaProcessCommand?: string;
  serverProcessLog?: ProcessLog;
  failOnStandardError?: boolean;
  allowGlobalPackageFallback?: boolean;
}

export class KarmaCommandLineTestServerExecutor implements TestServerExecutor {
  private disposables: Disposable[] = [];

  public constructor(
    private readonly projectRootPath: string,
    private readonly baseKarmaConfigFile: string,
    private readonly userKarmaConfigFile: string,
    private readonly processHandler: ProcessHandler,
    private readonly logger: SimpleLogger,
    private readonly options: KarmaCommandLineTestServerExecutorOptions
  ) {
    this.disposables.push(logger);
  }

  public executeServerStart(karmaPort: number, karmaSocketPort: number, debugPort?: number): Process {
    this.logger.debug(
      () => `Executing server start with karma port '${karmaPort}' and karma socket port '${karmaSocketPort}'`
    );

    const environment: Record<string, string> = {
      ...this.options.environment,
      [KarmaEnvironmentVariable.KarmaPort]: `${karmaPort}`,
      [KarmaEnvironmentVariable.KarmaSocketPort]: `${karmaSocketPort}`,
      [KarmaEnvironmentVariable.UserKarmaConfigPath]: this.userKarmaConfigFile
    };

    if (debugPort !== undefined) {
      environment[KarmaEnvironmentVariable.DebugPort] = `${debugPort}`;
    }

    const runOptions: SimpleProcessOptions = {
      cwd: this.projectRootPath,
      shell: false,
      env: environment,
      failOnStandardError: this.options.failOnStandardError,
      parentProcessName: KarmaCommandLineTestServerExecutor.name,
      processLog: this.options.serverProcessLog
    };

    const karmaLocalInstallPath = getPackageInstallPathForProjectRoot(
      'karma',
      this.projectRootPath,
      { allowGlobalPackageFallback: this.options.allowGlobalPackageFallback },
      this.logger
    );
    const karmaBinaryPath = karmaLocalInstallPath ? join(karmaLocalInstallPath, 'bin', 'karma') : undefined;

    if (!karmaBinaryPath) {
      throw new Error(
        `Karma does not seem to be installed - ` +
          `You may need to run 'npm install' in your project. ` +
          `Please install it and try again.`
      );
    }

    const nodeExecutablePath = getNodeExecutablePath(this.options.environment?.PATH);

    let command: string;
    let processArguments: string[] = [];

    if (this.options.karmaProcessCommand) {
      command = this.options.karmaProcessCommand;
    } else {
      command = nodeExecutablePath ?? process.execPath;
      processArguments = [karmaBinaryPath];
    }

    processArguments = [...processArguments, 'start', this.baseKarmaConfigFile, '--no-single-run'];

    const karmaServerProcess = this.processHandler.spawn(command, processArguments, runOptions);
    this.disposables.push(karmaServerProcess);

    return karmaServerProcess;
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
