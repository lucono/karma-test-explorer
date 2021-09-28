import { SpawnOptions } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { silent } from 'resolve-global';
import { TestRunExecutor } from '../../../api/test-run-executor';
import { Disposable } from '../../../util/disposable/disposable';
import { Disposer } from '../../../util/disposable/disposer';
import { Execution } from '../../../util/future/execution';
import { Logger } from '../../../util/logging/logger';
import { CommandLineProcessHandler } from '../../../util/process/command-line-process-handler';
import { CommandLineProcessLog } from '../../../util/process/command-line-process-log';
import { KarmaEnvironmentVariable } from '../karma-environment-variable';

export interface KarmaCommandLineTestRunExecutorOptions {
  environment: Record<string, string | undefined>;
  karmaProcessCommand?: string;
  serverProcessLog?: CommandLineProcessLog;
}

export class KarmaCommandLineTestRunExecutor implements TestRunExecutor {
  private disposables: Disposable[] = [];

  public constructor(
    private readonly projectRootPath: string,
    private readonly baseKarmaConfigFile: string,
    private readonly userKarmaConfigFile: string,
    private readonly options: KarmaCommandLineTestRunExecutorOptions,
    private readonly logger: Logger
  ) {}

  public executeTestRun(karmaPort: number, clientArgs: string[]): Execution {
    const environment: Record<string, string> = {
      ...this.options.environment,
      [KarmaEnvironmentVariable.KarmaPort]: `${karmaPort}`,
      [KarmaEnvironmentVariable.UserKarmaConfigPath]: this.userKarmaConfigFile
    };

    const spawnOptions: SpawnOptions = {
      cwd: this.projectRootPath,
      shell: true,
      env: environment
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
      throw new Error('Karma does not seem to be installed. Please install it and try again.');
    }

    const escapedClientArgs: string[] = clientArgs.map(arg => this.shellEscape(arg));
    processArguments = [...processArguments, 'run', this.baseKarmaConfigFile, '--', ...escapedClientArgs];

    const karmaServerProcess = new CommandLineProcessHandler(
      command,
      processArguments,
      this.logger,
      this.options.serverProcessLog,
      spawnOptions
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
