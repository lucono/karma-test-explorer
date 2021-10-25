import { existsSync } from 'fs';
import { join } from 'path';
import { silent } from 'resolve-global';
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

    const localKarmaPath = join(this.projectRootPath, 'node_modules', 'karma', 'bin', 'karma');
    const isKarmaInstalledLocally = existsSync(localKarmaPath);
    const isKarmaInstalledGlobally = silent('karma') !== undefined;

    let command: string;
    let processArguments: string[] = [];

    if (this.options.karmaProcessCommand) {
      command = this.options.karmaProcessCommand;
    } else if (isKarmaInstalledLocally) {
      command = 'npx';
      processArguments = ['karma'];
    } else if (isKarmaInstalledGlobally) {
      command = 'karma';
    } else {
      throw new Error(
        `Karma does not seem to be installed - ` +
          `You may need to run 'npm install' in your project. ` +
          `Please install it and try again.`
      );
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
