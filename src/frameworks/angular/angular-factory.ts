import { TestFactory } from '../../api/test-factory';
import { TestServerExecutor } from '../../api/test-server-executor';
import { ExtensionConfig } from '../../core/config/extension-config';
import { Disposable } from '../../util/disposable/disposable';
import { Disposer } from '../../util/disposable/disposer';
import { SimpleLogger } from '../../util/logging/simple-logger';
import { CommandLineProcessLog } from '../../util/process/command-line-process-log';
import { AngularTestServerExecutor, AngularTestServerExecutorOptions } from '../angular/angular-test-server-executor';
import { KarmaEnvironmentVariable } from '../karma/karma-environment-variable';
import { AngularProject } from './angular-project';

export type AngularFactoryConfig = Pick<
  ExtensionConfig,
  | 'angularProcessCommand'
  | 'autoWatchBatchDelay'
  | 'autoWatchEnabled'
  | 'baseKarmaConfFilePath'
  | 'browser'
  | 'customLauncher'
  | 'defaultAngularProjectName'
  | 'environment'
  | 'failOnStandardError'
  | 'karmaLogLevel'
  | 'karmaReporterLogLevel'
  | 'projectRootPath'
>;

export class AngularFactory implements Partial<TestFactory> {
  private disposables: Disposable[] = [];

  public constructor(
    private readonly factoryConfig: AngularFactoryConfig,
    private readonly angularProject: AngularProject,
    private readonly serverProcessLog: CommandLineProcessLog,
    private readonly logger: SimpleLogger
  ) {
    this.disposables.push(this.logger);
  }

  public createTestServerExecutor(): TestServerExecutor {
    this.logger.debug(() => 'Creating Angular test server executor');

    this.logger.info(
      () =>
        `Selected default Angular project '${this.angularProject.name}' ` +
        `at root path '${this.angularProject.rootPath}' ` +
        `and karma config file '${this.angularProject.karmaConfigPath}'`
    );

    const environment: Record<string, string | undefined> = {
      ...process.env,
      ...this.factoryConfig.environment,
      [KarmaEnvironmentVariable.AutoWatchEnabled]: `${this.factoryConfig.autoWatchEnabled}`,
      [KarmaEnvironmentVariable.AutoWatchBatchDelay]: `${this.factoryConfig.autoWatchBatchDelay ?? ''}`,
      [KarmaEnvironmentVariable.Browser]: this.factoryConfig.browser ?? '',
      [KarmaEnvironmentVariable.CustomLauncher]: JSON.stringify(this.factoryConfig.customLauncher),
      [KarmaEnvironmentVariable.KarmaLogLevel]: `${this.factoryConfig.karmaLogLevel}`,
      [KarmaEnvironmentVariable.KarmaReporterLogLevel]: `${this.factoryConfig.karmaReporterLogLevel}`
    };

    const options: AngularTestServerExecutorOptions = {
      environment,
      serverProcessLog: this.serverProcessLog,
      angularProcessCommand: this.factoryConfig.angularProcessCommand,
      failOnStandardError: this.factoryConfig.failOnStandardError
    };

    const serverExecutor = new AngularTestServerExecutor(
      this.angularProject,
      this.factoryConfig.projectRootPath,
      this.factoryConfig.baseKarmaConfFilePath,
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
