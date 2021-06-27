import { Logger } from "../../core/logger";
import { ExtensionConfig } from "../../core/extension-config";
import { TestRunExecutor } from "../../api/test-run-executor";
import { TestServerExecutor } from "../../api/test-server-executor";
import { KarmaCommandLineTestRunExecutor } from "./runner/karma-command-line-test-run-executor";
import { KarmaHttpTestRunExecutor } from "./runner/karma-http-test-run-executor";
import { TestRunner } from "../../api/test-runner";
import { KarmaTestEventListener } from "./runner/karma-test-event-listener";
import { KarmaTestRunner } from "./runner/karma-test-runner";
import { KarmaCommandLineTestServerExecutor, KarmaCommandLineTestServerExecutorOptions } from "./server/karma-command-line-test-server-executor";
import { TestServer } from "../../api/test-server";
import { KarmaServer } from "./server/karma-test-server";
import { TestFactory } from "../../api/test-factory";
import { Disposable } from "../../api/disposable";
import { CommandLineProcessLog } from "../../util/commandline-process-handler";
import { KarmaEnvironmentVariable } from "./karma-environment-variable";
import { TestLoadProcessor } from "./runner/test-load-processor";

export class KarmaFactory implements TestFactory {

  private disposables: Disposable[] = [];
  
  public constructor(
    private readonly config: ExtensionConfig,
    private readonly serverProcessLog: CommandLineProcessLog,
    private readonly logger: Logger)
  {
    this.disposables.push(config, logger);
  }

  public createTestServer(testServerExecutor?: TestServerExecutor): TestServer {
    const serverExecutor = testServerExecutor ?? this.createTestServerExecutor();
    return new KarmaServer(serverExecutor, this.logger);
  }

  public createTestRunner(
    karmaEventListener: KarmaTestEventListener,
    // testEventProcessor: TestEventProcessor,
    // testLoadEventProcessor: TestEventProcessor,
    // testRunEventProcessor: TestEventProcessor,
    // specToTestSuiteMapper: SpecResponseToTestSuiteInfoMapper,
    testLoadProcessor: TestLoadProcessor,
    testRunExecutor?: TestRunExecutor): TestRunner
  {
    const runExecutor = testRunExecutor ?? this.createTestRunExecutor();

    return new KarmaTestRunner(
      runExecutor,
      karmaEventListener,
      // testEventProcessor,
      // testLoadEventProcessor,
      // testRunEventProcessor,
      // specToTestSuiteMapper,
      testLoadProcessor,
      this.logger  // FIXME: Create new properly named logger
    );
  }

  public createTestServerExecutor(): TestServerExecutor {
    return this.createKarmaCommandLineTestServerExecutor();
  }

  public createTestRunExecutor(): TestRunExecutor {
    return this.config.karmaProcessExecutable
      ? this.createKarmaCommandLineTestRunExecutor()
      : this.createKarmaHttpTestRunExecutor();
  }

  private createKarmaHttpTestRunExecutor(): KarmaHttpTestRunExecutor {
    this.logger.info(`Creating Karma http test run executor`);

    return new KarmaHttpTestRunExecutor(this.logger);
  }

  private createKarmaCommandLineTestRunExecutor(): KarmaCommandLineTestRunExecutor {
    this.logger.info(`Creating Karma command line test run executor`);

    const environment: { [key: string]: string | undefined } = {
      ...process.env,
      ...this.config.envFileEnvironment,
      ...this.config.env
    };
    return new KarmaCommandLineTestRunExecutor(
      this.config.projectRootPath,
      this.config.baseKarmaConfFilePath,
      this.config.userKarmaConfFilePath,
      { environment },
      this.logger);
  }

  private createKarmaCommandLineTestServerExecutor(): KarmaCommandLineTestServerExecutor
  {
    this.logger.info(`Creating Karma test server executor`);
    
    const environment: { [key: string]: string | undefined } = {
      ...process.env,
      ...this.config.envFileEnvironment,
      ...this.config.env,
      [KarmaEnvironmentVariable.AutoWatchEnabled]: `${this.config.autoWatchEnabled}`,
      [KarmaEnvironmentVariable.AutoWatchBatchDelay]: `${this.config.autoWatchBatchDelay}`,
      [KarmaEnvironmentVariable.Browser]: `${this.config.browser}`,
      [KarmaEnvironmentVariable.CustomLauncher]: JSON.stringify(this.config.customLauncher),
      [KarmaEnvironmentVariable.DebugLevelLoggingEnabled]: `${this.config.debugLevelLoggingEnabled}`
    };
    const options: KarmaCommandLineTestServerExecutorOptions = {
        environment,
        serverProcessLog: this.serverProcessLog
    };

    return new KarmaCommandLineTestServerExecutor(
      this.config.projectRootPath,
      this.config.baseKarmaConfFilePath,
      this.config.userKarmaConfFilePath,
      options,
      this.logger);
  }

  public dispose() {
    this.disposables.forEach(disposable => disposable.dispose());
  }
}
