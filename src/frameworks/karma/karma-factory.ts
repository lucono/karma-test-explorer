import { TestFactory } from '../../api/test-factory.js';
import { TestRunExecutor } from '../../api/test-run-executor.js';
import { TestRunner } from '../../api/test-runner.js';
import { TestServerExecutor } from '../../api/test-server-executor.js';
import { TestServer } from '../../api/test-server.js';
import { TestFramework } from '../../core/base/test-framework.js';
import { ExtensionConfig, TestTriggerMethod } from '../../core/config/extension-config.js';
import { Disposable } from '../../util/disposable/disposable.js';
import { Disposer } from '../../util/disposable/disposer.js';
import { SimpleLogger } from '../../util/logging/simple-logger.js';
import { ProcessHandler } from '../../util/process/process-handler.js';
import { ProcessLog } from '../../util/process/process-log.js';
import { KarmaEnvironmentVariable } from './karma-environment-variable.js';
import {
  KarmaCommandLineTestRunExecutor,
  KarmaCommandLineTestRunExecutorOptions
} from './runner/karma-command-line-test-run-executor.js';
import { KarmaHttpTestRunExecutor } from './runner/karma-http-test-run-executor.js';
import { KarmaTestListener } from './runner/karma-test-listener.js';
import { KarmaTestRunner } from './runner/karma-test-runner.js';
import { TestDiscoveryProcessor } from './runner/test-discovery-processor.js';
import {
  KarmaCommandLineTestServerExecutor,
  KarmaCommandLineTestServerExecutorOptions
} from './server/karma-command-line-test-server-executor.js';
import { KarmaTestServer } from './server/karma-test-server.js';

export type KarmaFactoryConfig = Pick<
  ExtensionConfig,
  | 'autoWatchBatchDelay'
  | 'autoWatchEnabled'
  | 'baseKarmaConfFilePath'
  | 'browser'
  | 'customLauncher'
  | 'environment'
  | 'failOnStandardError'
  | 'allowGlobalPackageFallback'
  | 'logLevel'
  | 'karmaLogLevel'
  | 'karmaReporterLogLevel'
  | 'karmaProcessCommand'
  | 'projectPath'
  | 'testTriggerMethod'
  | 'projectKarmaConfigFilePath'
>;

export class KarmaFactory implements TestFactory, Disposable {
  private disposables: Disposable[] = [];

  public constructor(
    private readonly testFramework: TestFramework,
    private readonly config: KarmaFactoryConfig,
    private readonly processHandler: ProcessHandler,
    private readonly serverProcessLog: ProcessLog,
    private readonly logger: SimpleLogger
  ) {
    this.disposables.push(this.logger);
  }

  public createTestServer(testServerExecutor?: TestServerExecutor): TestServer {
    const serverExecutor = testServerExecutor ?? this.createTestServerExecutor();
    const testServer = new KarmaTestServer(serverExecutor, this.createLogger(KarmaTestServer.name));

    this.disposables.push(serverExecutor, testServer);
    return testServer;
  }

  public createTestRunner(
    karmaEventListener: KarmaTestListener,
    testDiscoveryProcessor: TestDiscoveryProcessor,
    testRunExecutor?: TestRunExecutor
  ): TestRunner {
    const runExecutor = testRunExecutor ?? this.createTestRunExecutor();

    const testRunner = new KarmaTestRunner(
      runExecutor,
      this.testFramework,
      karmaEventListener,
      testDiscoveryProcessor,
      this.createLogger(KarmaTestRunner.name)
    );
    this.disposables.push(runExecutor, testRunner);
    return testRunner;
  }

  public createTestServerExecutor(): TestServerExecutor {
    return this.createKarmaCommandLineTestServerExecutor();
  }

  public createTestRunExecutor(): TestRunExecutor {
    return this.config.testTriggerMethod === TestTriggerMethod.Cli
      ? this.createKarmaCommandLineTestRunExecutor()
      : this.createKarmaHttpTestRunExecutor();
  }

  private createKarmaHttpTestRunExecutor(): KarmaHttpTestRunExecutor {
    this.logger.debug(() => 'Creating Karma http test run executor');

    const testRunExecutor = new KarmaHttpTestRunExecutor(this.createLogger(KarmaHttpTestRunExecutor.name));
    this.disposables.push(testRunExecutor);
    return testRunExecutor;
  }

  private createKarmaCommandLineTestRunExecutor(): KarmaCommandLineTestRunExecutor {
    this.logger.debug(() => 'Creating Karma command line test run executor');

    const environment: Record<string, string | undefined> = {
      ...process.env,
      ...this.config.environment
    };

    const options: KarmaCommandLineTestRunExecutorOptions = {
      environment,
      karmaProcessCommand: this.config.karmaProcessCommand,
      failOnStandardError: this.config.failOnStandardError,
      allowGlobalPackageFallback: this.config.allowGlobalPackageFallback
    };

    const testRunExecutor = new KarmaCommandLineTestRunExecutor(
      this.config.projectPath,
      this.processHandler,
      this.createLogger(KarmaCommandLineTestRunExecutor.name),
      options
    );
    this.disposables.push(testRunExecutor);
    return testRunExecutor;
  }

  private createKarmaCommandLineTestServerExecutor(): KarmaCommandLineTestServerExecutor {
    this.logger.debug(() => 'Creating Karma test server executor');

    const environment: Record<string, string | undefined> = {
      ...process.env,
      ...this.config.environment,
      [KarmaEnvironmentVariable.AutoWatchEnabled]: `${this.config.autoWatchEnabled}`,
      [KarmaEnvironmentVariable.AutoWatchBatchDelay]: `${this.config.autoWatchBatchDelay ?? ''}`,
      [KarmaEnvironmentVariable.Browser]: this.config.browser ?? '',
      [KarmaEnvironmentVariable.CustomLauncher]: JSON.stringify(this.config.customLauncher),
      [KarmaEnvironmentVariable.ExtensionLogLevel]: `${this.config.logLevel}`,
      [KarmaEnvironmentVariable.KarmaLogLevel]: `${this.config.karmaLogLevel}`,
      [KarmaEnvironmentVariable.KarmaReporterLogLevel]: `${this.config.karmaReporterLogLevel}`
    };

    const options: KarmaCommandLineTestServerExecutorOptions = {
      environment,
      serverProcessLog: this.serverProcessLog,
      karmaProcessCommand: this.config.karmaProcessCommand,
      failOnStandardError: this.config.failOnStandardError,
      allowGlobalPackageFallback: this.config.allowGlobalPackageFallback
    };

    if (this.config.projectKarmaConfigFilePath === undefined) {
      this.logger.error(
        () =>
          `Cannot create Karma Test Server Executor - ` +
          `No karma config file for the project at: ${this.config.projectPath}`
      );
      throw new Error(`No karma config file for project at: ${this.config.projectPath}`);
    }

    const testServerExecutor = new KarmaCommandLineTestServerExecutor(
      this.config.projectPath,
      this.config.baseKarmaConfFilePath,
      this.config.projectKarmaConfigFilePath,
      this.processHandler,
      this.createLogger(KarmaCommandLineTestServerExecutor.name),
      options
    );
    this.disposables.push(testServerExecutor);
    return testServerExecutor;
  }

  private createLogger(loggerName: string): SimpleLogger {
    return new SimpleLogger(this.logger, loggerName);
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
