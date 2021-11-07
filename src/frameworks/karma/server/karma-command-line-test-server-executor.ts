import { join } from 'path';
import which from 'which';
import { ServerStopExecutor, TestServerExecutor } from '../../../api/test-server-executor';
import { Disposable } from '../../../util/disposable/disposable';
import { Disposer } from '../../../util/disposable/disposer';
import { DeferredExecution } from '../../../util/future/deferred-execution';
import { Execution } from '../../../util/future/execution';
import { SimpleLogger } from '../../../util/logging/simple-logger';
import {
  CommandLineProcessHandler,
  CommandLineProcessHandlerOptions
} from '../../../util/process/command-line-process-handler';
import { CommandLineProcessLog } from '../../../util/process/command-line-process-log';
import { getPackageInstallPathForProjectRoot } from '../../../util/utils';
import { KarmaEnvironmentVariable } from '../karma-environment-variable';

export interface KarmaCommandLineTestServerExecutorOptions {
  environment: { readonly [key: string]: string | undefined };
  karmaProcessCommand?: string;
  serverProcessLog?: CommandLineProcessLog;
  failOnStandardError?: boolean;
}

export class KarmaCommandLineTestServerExecutor implements TestServerExecutor {
  private disposables: Disposable[] = [];

  public constructor(
    private readonly projectRootPath: string,
    private readonly baseKarmaConfigFile: string,
    private readonly userKarmaConfigFile: string,
    private readonly options: KarmaCommandLineTestServerExecutorOptions,
    private readonly logger: SimpleLogger
  ) {
    this.disposables.push(logger);
  }

  public executeServerStart(
    karmaPort: number,
    karmaSocketPort: number,
    debugPort?: number
  ): Execution<ServerStopExecutor> {
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

    const runOptions: CommandLineProcessHandlerOptions = {
      cwd: this.projectRootPath,
      shell: false,
      env: environment,
      failOnStandardError: this.options.failOnStandardError
    };

    const karmaInstallPath = getPackageInstallPathForProjectRoot('karma', this.projectRootPath);
    const karmaBinaryPath = karmaInstallPath ? join(karmaInstallPath, 'bin', 'karma') : undefined;

    if (!karmaBinaryPath) {
      throw new Error(
        `Karma does not seem to be installed - ` +
          `You may need to run 'npm install' in your project. ` +
          `Please install it and try again.`
      );
    }

    const nodeExecutablePath = which.sync('node', { all: false, nothrow: true });

    let command: string;
    let processArguments: string[] = [];

    if (this.options.karmaProcessCommand) {
      command = this.options.karmaProcessCommand;
    } else {
      command = nodeExecutablePath ?? process.execPath;
      processArguments = [karmaBinaryPath];
    }

    processArguments = [...processArguments, 'start', this.baseKarmaConfigFile, '--no-single-run'];

    const commandLineProcessLogger = new SimpleLogger(
      this.logger,
      `${KarmaCommandLineTestServerExecutor.name}:${CommandLineProcessHandler.name}`
    );

    const karmaServerProcess = new CommandLineProcessHandler(
      command,
      processArguments,
      commandLineProcessLogger,
      this.options.serverProcessLog,
      runOptions
    );
    this.disposables.push(karmaServerProcess);

    const serverStopper: ServerStopExecutor = {
      executeServerStop: async () => karmaServerProcess.stop()
    };

    const deferredServerExecution = new DeferredExecution<ServerStopExecutor>();

    karmaServerProcess
      .execution()
      .started()
      .then(() => deferredServerExecution.start(serverStopper));

    karmaServerProcess
      .execution()
      .ended()
      .then(() => deferredServerExecution.end());

    karmaServerProcess
      .execution()
      .failed()
      .then(reason => deferredServerExecution.fail(reason));

    return deferredServerExecution.execution();
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
