import { dirname, join } from 'path';

import { TestServerExecutor } from '../../api/test-server-executor.js';
import { EXTENSION_CONFIG_PREFIX, EXTENSION_NAME } from '../../constants.js';
import { ExternalConfigSetting } from '../../core/config/config-setting.js';
import { Disposable } from '../../util/disposable/disposable.js';
import { Disposer } from '../../util/disposable/disposer.js';
import { SimpleLogger } from '../../util/logging/simple-logger.js';
import { ProcessHandler } from '../../util/process/process-handler.js';
import { ProcessLog } from '../../util/process/process-log.js';
import { Process } from '../../util/process/process.js';
import { SimpleProcessOptions } from '../../util/process/simple-process.js';
import { getNodeExecutablePath, getPackageInstallPathForProjectRoot } from '../../util/utils.js';
import { DefaultCommand } from '../../workspace.js';
import { KarmaEnvironmentVariable } from '../karma/karma-environment-variable.js';

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
    private readonly projectName: string,
    private readonly projectPath: string,
    private readonly projectInstallRootPath: string,
    private readonly projectKarmaConfigFile: string | undefined,
    private readonly baseKarmaConfigFile: string,
    private readonly processHandler: ProcessHandler,
    private readonly logger: SimpleLogger,
    private readonly options: AngularTestServerExecutorOptions = {},
    private readonly defaultCommand: DefaultCommand
  ) {}

  public executeServerStart(karmaPort: number, karmaSocketPort: number, debugPort?: number): Process {
    this.logger.debug(
      () => `Executing server start with karma port '${karmaPort}' and karma socket port '${karmaSocketPort}'`
    );

    const environment: Record<string, string> = {
      ...this.options?.environment,
      [KarmaEnvironmentVariable.KarmaPort]: `${karmaPort}`,
      [KarmaEnvironmentVariable.KarmaSocketPort]: `${karmaSocketPort}`,
      [KarmaEnvironmentVariable.ProjectKarmaConfigHomePath]: `${this.projectPath}`
    };

    if (this.projectKarmaConfigFile !== undefined) {
      environment[KarmaEnvironmentVariable.ProjectKarmaConfigPath] = this.projectKarmaConfigFile;
      environment[KarmaEnvironmentVariable.ProjectKarmaConfigHomePath] = dirname(this.projectKarmaConfigFile);
    }

    if (debugPort !== undefined) {
      environment[KarmaEnvironmentVariable.DebugPort] = `${debugPort}`;
    }

    const runOptions: SimpleProcessOptions = {
      cwd: this.projectPath,
      shell: false,
      env: environment,
      failOnStandardError: this.options.failOnStandardError,
      parentProcessName: AngularTestServerExecutor.name,
      processLog: this.options.serverProcessLog
    };

    let command: string;
    let processArguments: string[] = [];

    if (this.options.angularProcessCommand) {
      command = this.options.angularProcessCommand;
    } else {
      const nodeExecutablePath = getNodeExecutablePath(this.options.environment?.PATH);

      const angularLocalInstallPath = getPackageInstallPathForProjectRoot(
        this.defaultCommand.package,
        this.projectInstallRootPath,
        this.logger,
        { allowGlobalPackageFallback: this.options.allowGlobalPackageFallback }
      );
      const angularBinaryPath = angularLocalInstallPath
        ? join(angularLocalInstallPath, ...this.defaultCommand.path)
        : undefined;

      if (!angularBinaryPath) {
        throw new Error(
          `${this.defaultCommand.package} does not seem to be installed. You may ` +
            `need to install your project dependencies or ` +
            `specify the right path to your project using the ` +
            `${EXTENSION_CONFIG_PREFIX}.${ExternalConfigSetting.ProjectWorkspaces} ` +
            `setting.`
        );
      }

      command = nodeExecutablePath ?? process.execPath;
      processArguments = [angularBinaryPath];
    }

    processArguments = [
      ...processArguments,
      'test',
      this.projectName,
      `--karma-config=${this.baseKarmaConfigFile}`,
      '--progress=false',
      '--no-watch'
    ];

    this.logKarmaLaunch();
    const angularProcess = this.processHandler.spawn(command, processArguments, runOptions);
    this.disposables.push(angularProcess);

    return angularProcess;
  }

  private logKarmaLaunch() {
    const launchMessage =
      `------------------------------------\n` +
      `${EXTENSION_NAME}: Launching Karma\n` +
      `------------------------------------\n`;
    this.options.serverProcessLog?.output(() => launchMessage);
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
