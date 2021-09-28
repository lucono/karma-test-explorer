import { TestFactory } from '../../api/test-factory';
import { TestRunExecutor } from '../../api/test-run-executor';
import { TestRunner } from '../../api/test-runner';
import { TestServer } from '../../api/test-server';
import { TestServerExecutor } from '../../api/test-server-executor';
import { TestFramework } from '../../core/base/test-framework';
import { ExtensionConfig } from '../../core/config/extension-config';
import { Disposable } from '../../util/disposable/disposable';
import { Disposer } from '../../util/disposable/disposer';
import { SimpleLogger } from '../../util/logging/simple-logger';
import { CommandLineProcessLog } from '../../util/process/command-line-process-log';
import { KarmaEnvironmentVariable } from './karma-environment-variable';
import { KarmaCommandLineTestRunExecutor } from './runner/karma-command-line-test-run-executor';
import { KarmaHttpTestRunExecutor } from './runner/karma-http-test-run-executor';
import { KarmaTestEventListener } from './runner/karma-test-event-listener';
import { KarmaTestRunner } from './runner/karma-test-runner';
import { TestDiscoveryProcessor } from './runner/test-discovery-processor';
import {
  KarmaCommandLineTestServerExecutor,
  KarmaCommandLineTestServerExecutorOptions
} from './server/karma-command-line-test-server-executor';
import { KarmaTestServer } from './server/karma-test-server';

export class KarmaFactory implements TestFactory, Disposable {
  private disposables: Disposable[] = [];

  public constructor(
    private readonly testFramework: TestFramework,
    private readonly config: ExtensionConfig,
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
    karmaEventListener: KarmaTestEventListener,
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
    return this.config.karmaProcessExecutable
      ? this.createKarmaCommandLineTestRunExecutor(this.config.karmaProcessExecutable)
      : this.createKarmaHttpTestRunExecutor();
  }

  private createKarmaHttpTestRunExecutor(): KarmaHttpTestRunExecutor {
    this.logger.debug(() => 'Creating Karma http test run executor');

    const testRunExecutor = new KarmaHttpTestRunExecutor(this.createLogger(KarmaHttpTestRunExecutor.name));
    this.disposables.push(testRunExecutor);
    return testRunExecutor;
  }

  private createKarmaCommandLineTestRunExecutor(karmaProcessCommand: string): KarmaCommandLineTestRunExecutor {
    this.logger.debug(() => 'Creating Karma command line test run executor');

    const environment: Record<string, string | undefined> = {
      ...process.env,
      ...this.config.environment
    };

    const testRunExecutor = new KarmaCommandLineTestRunExecutor(
      this.config.projectRootPath,
      this.config.baseKarmaConfFilePath,
      this.config.userKarmaConfFilePath,
      { karmaProcessCommand, environment },
      this.createLogger(KarmaCommandLineTestRunExecutor.name)
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
      [KarmaEnvironmentVariable.AutoWatchBatchDelay]: `${this.config.autoWatchBatchDelay}`,
      [KarmaEnvironmentVariable.Browser]: `${this.config.browser}`,
      [KarmaEnvironmentVariable.CustomLauncher]: JSON.stringify(this.config.customLauncher),
      [KarmaEnvironmentVariable.KarmaLogLevel]: `${this.config.karmaLogLevel}`
    };

    const options: KarmaCommandLineTestServerExecutorOptions = {
      environment,
      serverProcessLog: this.serverProcessLog
    };

    const testServerExecutor = new KarmaCommandLineTestServerExecutor(
      this.config.projectRootPath,
      this.config.baseKarmaConfFilePath,
      this.config.userKarmaConfFilePath,
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
