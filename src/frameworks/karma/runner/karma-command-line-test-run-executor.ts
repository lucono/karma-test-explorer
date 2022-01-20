import { join } from 'path';
import { TestRunExecutor } from '../../../api/test-run-executor';
import { Disposable } from '../../../util/disposable/disposable';
import { Disposer } from '../../../util/disposable/disposer';
import { Execution } from '../../../util/future/execution';
import { SimpleLogger } from '../../../util/logging/simple-logger';
import {
  CommandLineProcessHandler,
  CommandLineProcessHandlerOptions,
  CommandLineProcessLogOutput
} from '../../../util/process/command-line-process-handler';
import { getNodeExecutablePath, getPackageInstallPathForProjectRoot } from '../../../util/utils';

export interface KarmaCommandLineTestRunExecutorOptions {
  environment: Record<string, string | undefined>;
  karmaProcessCommand?: string;
  failOnStandardError?: boolean;
  allowGlobalPackageFallback?: boolean;
}

export class KarmaCommandLineTestRunExecutor implements TestRunExecutor {
  private disposables: Disposable[] = [];

  public constructor(
    private readonly projectRootPath: string,
    private readonly options: KarmaCommandLineTestRunExecutorOptions,
    private readonly logger: SimpleLogger
  ) {}

  public executeTestRun(karmaPort: number, clientArgs: string[]): Execution {
    const runOptions: CommandLineProcessHandlerOptions = {
      cwd: this.projectRootPath,
      shell: false,
      env: this.options.environment,
      failOnStandardError: this.options.failOnStandardError
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

    const escapedClientArgs: string[] = clientArgs.map(arg => this.shellEscape(arg));
    processArguments = [...processArguments, 'run', '--port', `${karmaPort}`, '--', ...escapedClientArgs];

    const commandLineProcessLogger = new SimpleLogger(
      this.logger,
      `${KarmaCommandLineTestRunExecutor.name}::${CommandLineProcessHandler.name}`
    );

    const karmaServerProcess = new CommandLineProcessHandler(
      command,
      processArguments,
      commandLineProcessLogger,
      CommandLineProcessLogOutput.None,
      runOptions
    );

    return karmaServerProcess.execution();
  }

  private shellEscape(shellString: string) {
    return shellString.replace(/[\W ]/g, '\\$&');
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
