import { TestFactory } from '../../api/test-factory.js';
import { TestServerExecutor } from '../../api/test-server-executor.js';
import { ExtensionConfig } from '../../core/config/extension-config.js';
import { Disposable } from '../../util/disposable/disposable.js';
import { Disposer } from '../../util/disposable/disposer.js';
import { SimpleLogger } from '../../util/logging/simple-logger.js';
import { ProcessHandler } from '../../util/process/process-handler.js';
import { ProcessLog } from '../../util/process/process-log.js';
import { excludeSelectedEntries } from '../../util/utils.js';
import {
  AngularTestServerExecutor,
  AngularTestServerExecutorOptions
} from '../angular/angular-test-server-executor.js';
import { KarmaEnvironmentVariable } from '../karma/karma-environment-variable.js';

export type AngularFactoryConfig = Pick<
  ExtensionConfig,
  | 'projectName'
  | 'angularProcessCommand'
  | 'autoWatchBatchDelay'
  | 'autoWatchEnabled'
  | 'baseKarmaConfFilePath'
  | 'projectKarmaConfigFilePath'
  | 'browser'
  | 'customLauncher'
  | 'environment'
  | 'excludedEnvironmentVariables'
  | 'failOnStandardError'
  | 'allowGlobalPackageFallback'
  | 'logLevel'
  | 'karmaLogLevel'
  | 'karmaReporterLogLevel'
  | 'projectPath'
  | 'projectInstallRootPath'
>;

export class AngularFactory implements Partial<TestFactory> {
  private disposables: Disposable[] = [];

  public constructor(
    private readonly config: AngularFactoryConfig,
    private readonly processHandler: ProcessHandler,
    private readonly serverProcessLog: ProcessLog,
    private readonly logger: SimpleLogger
  ) {
    this.disposables.push(this.logger);
  }

  public createTestServerExecutor(): TestServerExecutor {
    this.logger.debug(() => 'Creating Angular test server executor');

    this.logger.info(
      () =>
        `Using Angular project '${this.config.projectName}' ` +
        `at root path '${this.config.projectPath}' ` +
        `and karma config file '${this.config.projectKarmaConfigFilePath ?? '<none>'}'`
    );

    this.logger.trace(
      () => `Pre-modification test server executor environment: ${JSON.stringify(process.env, null, 2)}`
    );

    const combinedEnvironment = { ...process.env, ...this.config.environment };
    const filteredEnvironment = excludeSelectedEntries(combinedEnvironment, this.config.excludedEnvironmentVariables);

    this.logger.trace(
      () =>
        `Post-modification test server executor environment after processing: ` +
        `${JSON.stringify(filteredEnvironment, null, 2)}`
    );

    const environment: Record<string, string | undefined> = {
      ...filteredEnvironment,
      [KarmaEnvironmentVariable.AutoWatchEnabled]: `${this.config.autoWatchEnabled}`,
      [KarmaEnvironmentVariable.AutoWatchBatchDelay]: `${this.config.autoWatchBatchDelay}`,
      [KarmaEnvironmentVariable.Browser]: this.config.browser ?? '',
      [KarmaEnvironmentVariable.CustomLauncher]: JSON.stringify(this.config.customLauncher),
      [KarmaEnvironmentVariable.ExtensionLogLevel]: `${this.config.logLevel}`,
      [KarmaEnvironmentVariable.KarmaLogLevel]: `${this.config.karmaLogLevel}`,
      [KarmaEnvironmentVariable.KarmaReporterLogLevel]: `${this.config.karmaReporterLogLevel}`
    };

    const options: AngularTestServerExecutorOptions = {
      environment,
      serverProcessLog: this.serverProcessLog,
      angularProcessCommand: this.config.angularProcessCommand,
      failOnStandardError: this.config.failOnStandardError,
      allowGlobalPackageFallback: this.config.allowGlobalPackageFallback
    };

    const serverExecutor = new AngularTestServerExecutor(
      this.config.projectName,
      this.config.projectPath,
      this.config.projectInstallRootPath,
      this.config.projectKarmaConfigFilePath,
      this.config.baseKarmaConfFilePath,
      this.processHandler,
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
