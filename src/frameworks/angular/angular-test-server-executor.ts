import { join } from 'path';
import { TestServerExecutor } from '../../api/test-server-executor';
import { EXTENSION_CONFIG_PREFIX } from '../../constants';
import { ExternalConfigSetting } from '../../core/config/config-setting';
import { Disposable } from '../../util/disposable/disposable';
import { Disposer } from '../../util/disposable/disposer';
import { SimpleLogger } from '../../util/logging/simple-logger';
import { Process } from '../../util/process/process';
import { ProcessHandler } from '../../util/process/process-handler';
import { ProcessLog } from '../../util/process/process-log';
import { SimpleProcessOptions } from '../../util/process/simple-process';
import { getNodeExecutablePath, getPackageInstallPathForProjectRoot } from '../../util/utils';
import { KarmaEnvironmentVariable } from '../karma/karma-environment-variable';

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
    private readonly projectKarmaConfigFile: string,
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
      [KarmaEnvironmentVariable.ProjectKarmaConfigPath]: this.projectKarmaConfigFile,
      [KarmaEnvironmentVariable.KarmaPort]: `${karmaPort}`,
      [KarmaEnvironmentVariable.KarmaSocketPort]: `${karmaSocketPort}`
    };

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

    const nodeExecutablePath = getNodeExecutablePath(this.options.environment?.PATH);

    let command: string;
    let processArguments: string[] = [];

    if (this.options.angularProcessCommand) {
      command = this.options.angularProcessCommand;
    } else {
      const angularLocalInstallPath = getPackageInstallPathForProjectRoot(
        '@angular/cli',
        this.projectInstallRootPath,
        { allowGlobalPackageFallback: this.options.allowGlobalPackageFallback },
        this.logger
      );
      const angularBinaryPath = angularLocalInstallPath ? join(angularLocalInstallPath, 'bin', 'ng') : undefined;

      if (!angularBinaryPath) {
        throw new Error(
          `Angular CLI does not seem to be installed. You may ` +
            `need to install your project dependencies or ` +
            `specify the right path to your project using the ` +
            `${EXTENSION_CONFIG_PREFIX}.${ExternalConfigSetting.Projects} ` +
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

    const angularProcess = this.processHandler.spawn(command, processArguments, runOptions);
    this.disposables.push(angularProcess);

    return angularProcess;
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
