import { TestFactory } from '../../api/test-factory';
import { TestServerExecutor } from '../../api/test-server-executor';
import { ExtensionConfig } from '../../core/config/extension-config';
import { MessageType, Notifications } from '../../core/vscode/notifications';
import { Disposable } from '../../util/disposable/disposable';
import { Disposer } from '../../util/disposable/disposer';
import { SimpleLogger } from '../../util/logging/simple-logger';
import { CommandLineProcessLog } from '../../util/process/command-line-process-log';
import { AngularTestServerExecutor } from '../angular/angular-test-server-executor';
import { KarmaEnvironmentVariable } from '../karma/karma-environment-variable';
import { KarmaCommandLineTestServerExecutorOptions } from '../karma/server/karma-command-line-test-server-executor';
import { getDefaultAngularProject } from './angular-util';

export class AngularFactory implements Partial<TestFactory> {
  private disposables: Disposable[] = [];

  public constructor(
    private readonly config: ExtensionConfig,
    private readonly notifications: Notifications,
    private readonly serverProcessLog: CommandLineProcessLog,
    private readonly logger: SimpleLogger
  ) {
    this.disposables.push(this.logger);
  }

  public createTestServerExecutor(): TestServerExecutor {
    this.logger.debug(() => 'Creating Angular test server executor');

    const angularProject = getDefaultAngularProject(this.config.projectRootPath, this.config.defaultAngularProjectName);

    if (angularProject === undefined) {
      const errorMessage = 'Could not determine Angular project from workspace';
      this.notifications.notify(MessageType.Error, errorMessage);
      throw new Error(errorMessage);
    }
    this.logger.info(
      () =>
        `Selected default Angular project '${angularProject.name}' ` +
        `at root path '${angularProject.rootPath}' ` +
        `and karma config file '${angularProject.karmaConfigPath}'`
    );

    const environment: Record<string, string | undefined> = {
      ...process.env,
      ...this.config.environment,
      [KarmaEnvironmentVariable.AutoWatchEnabled]: `${this.config.autoWatchEnabled}`,
      [KarmaEnvironmentVariable.AutoWatchBatchDelay]: `${this.config.autoWatchBatchDelay}`,
      [KarmaEnvironmentVariable.Browser]: `${this.config.browser}`,
      [KarmaEnvironmentVariable.CustomLauncher]: JSON.stringify(this.config.customLauncher),
      [KarmaEnvironmentVariable.KarmaLogLevel]: `${this.config.karmaLogLevel}`
    };

    const options: KarmaCommandLineTestServerExecutorOptions = {
      environment,
      serverProcessLog: this.serverProcessLog
    };

    const serverExecutor = new AngularTestServerExecutor(
      angularProject,
      this.config.projectRootPath,
      this.config.baseKarmaConfFilePath,
      new SimpleLogger(this.logger, AngularTestServerExecutor.name),
      options
    );
    this.disposables.push(serverExecutor);
    return serverExecutor;
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
