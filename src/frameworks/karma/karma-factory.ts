import { TestFactory } from '../../api/test-factory';
import { TestRunExecutor } from '../../api/test-run-executor';
import { TestRunner } from '../../api/test-runner';
import { TestServer } from '../../api/test-server';
import { TestServerExecutor } from '../../api/test-server-executor';
import { TestFramework } from '../../core/base/test-framework';
import { ExtensionConfig, TestTriggerMethod } from '../../core/config/extension-config';
import { Disposable } from '../../util/disposable/disposable';
import { Disposer } from '../../util/disposable/disposer';
import { SimpleLogger } from '../../util/logging/simple-logger';
import { CommandLineProcessLog } from '../../util/process/command-line-process-log';
import { KarmaEnvironmentVariable } from './karma-environment-variable';
import {
  KarmaCommandLineTestRunExecutor,
  KarmaCommandLineTestRunExecutorOptions
} from './runner/karma-command-line-test-run-executor';
import { KarmaHttpTestRunExecutor } from './runner/karma-http-test-run-executor';
import { KarmaTestListener } from './runner/karma-test-listener';
import { KarmaTestRunner } from './runner/karma-test-runner';
import { TestDiscoveryProcessor } from './runner/test-discovery-processor';
import {
  KarmaCommandLineTestServerExecutor,
  KarmaCommandLineTestServerExecutorOptions
} from './server/karma-command-line-test-server-executor';
import { KarmaTestServer } from './server/karma-test-server';

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
  | 'karmaLogLevel'
  | 'karmaReporterLogLevel'
  | 'karmaProcessCommand'
  | 'projectRootPath'
  | 'testTriggerMethod'
  | 'userKarmaConfFilePath'
>;

export class KarmaFactory implements TestFactory, Disposable {
  private disposables: Disposable[] = [];

  public constructor(
    private readonly testFramework: TestFramework,
    private readonly factoryConfig: KarmaFactoryConfig,
    private readonly serverProcessLog: CommandLineProcessLog,
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
    return this.factoryConfig.testTriggerMethod === TestTriggerMethod.Cli
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
      ...this.factoryConfig.environment
    };

    const options: KarmaCommandLineTestRunExecutorOptions = {
      environment,
      karmaProcessCommand: this.factoryConfig.karmaProcessCommand,
      failOnStandardError: this.factoryConfig.failOnStandardError,
      allowGlobalPackageFallback: this.factoryConfig.allowGlobalPackageFallback
    };

    const testRunExecutor = new KarmaCommandLineTestRunExecutor(
      this.factoryConfig.projectRootPath,
      options,
      this.createLogger(KarmaCommandLineTestRunExecutor.name)
    );
    this.disposables.push(testRunExecutor);
    return testRunExecutor;
  }

  private createKarmaCommandLineTestServerExecutor(): KarmaCommandLineTestServerExecutor {
    this.logger.debug(() => 'Creating Karma test server executor');

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

    const options: KarmaCommandLineTestServerExecutorOptions = {
      environment,
      serverProcessLog: this.serverProcessLog,
      karmaProcessCommand: this.factoryConfig.karmaProcessCommand,
      failOnStandardError: this.factoryConfig.failOnStandardError,
      allowGlobalPackageFallback: this.factoryConfig.allowGlobalPackageFallback
    };

    const testServerExecutor = new KarmaCommandLineTestServerExecutor(
      this.factoryConfig.projectRootPath,
      this.factoryConfig.baseKarmaConfFilePath,
      this.factoryConfig.userKarmaConfFilePath,
      options,
      this.createLogger(KarmaCommandLineTestServerExecutor.name)
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
