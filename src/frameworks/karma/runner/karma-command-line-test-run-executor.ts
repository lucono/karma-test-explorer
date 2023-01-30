import { join } from 'path';

import { TestRunExecutor } from '../../../api/test-run-executor.js';
import { EXTENSION_CONFIG_PREFIX } from '../../../constants.js';
import { ExternalConfigSetting } from '../../../core/config/config-setting.js';
import { Disposable } from '../../../util/disposable/disposable.js';
import { Disposer } from '../../../util/disposable/disposer.js';
import { Execution } from '../../../util/future/execution.js';
import { SimpleLogger } from '../../../util/logging/simple-logger.js';
import { ProcessHandler } from '../../../util/process/process-handler.js';
import { SimpleProcessOptions } from '../../../util/process/simple-process.js';
import { getNodeExecutablePath, getPackageInstallPathForProjectRoot } from '../../../util/utils.js';

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
    private readonly processHandler: ProcessHandler,
    private readonly logger: SimpleLogger,
    private readonly options: KarmaCommandLineTestRunExecutorOptions
  ) {}

  public executeTestRun(karmaPort: number, clientArgs: string[]): Execution {
    const runOptions: SimpleProcessOptions = {
      cwd: this.projectRootPath,
      shell: false,
      env: this.options.environment,
      failOnStandardError: this.options.failOnStandardError,
      parentProcessName: KarmaCommandLineTestRunExecutor.name
    };

    const nodeExecutablePath = getNodeExecutablePath(this.options.environment?.PATH);

    let command: string;
    let processArguments: string[] = [];

    if (this.options.karmaProcessCommand) {
      command = this.options.karmaProcessCommand;
    } else {
      const karmaLocalInstallPath = getPackageInstallPathForProjectRoot('karma', this.projectRootPath, this.logger, {
        allowGlobalPackageFallback: this.options.allowGlobalPackageFallback
      });
      const karmaBinaryPath = karmaLocalInstallPath ? join(karmaLocalInstallPath, 'bin', 'karma') : undefined;

      if (!karmaBinaryPath) {
        throw new Error(
          `Karma does not seem to be installed. You may ` +
            `need to install your project dependencies or ` +
            `specify the right path to your project using the ` +
            `${EXTENSION_CONFIG_PREFIX}.${ExternalConfigSetting.ProjectWorkspaces} ` +
            `setting.`
        );
      }

      command = nodeExecutablePath ?? process.execPath;
      processArguments = [karmaBinaryPath];
    }

    const escapedClientArgs: string[] = clientArgs.map(arg => this.shellEscape(arg));
    processArguments = [...processArguments, 'run', '--port', `${karmaPort}`, '--', ...escapedClientArgs];

    const karmaServerProcess = this.processHandler.spawn(command, processArguments, runOptions);

    return karmaServerProcess.execution();
  }

  private shellEscape(shellString: string) {
    return shellString.replace(/[\W ]/g, '\\$&');
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
