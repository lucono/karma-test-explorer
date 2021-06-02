import { Logger } from "../../../core/logger";
import { ExtensionConfig } from "../../../core/extension-config";
import { TestRunExecutor } from "../../../api/test-run-executor";
import { KarmaCommandLineTestRunExecutor } from "./karma-command-line-test-run-executor";
import { KarmaHttpTestRunExecutor } from "./karma-http-test-run-executor";
import { TestRunner } from "../../../api/test-runner";
import { KarmaEventListener } from "./karma-event-listener";
import { SpecResponseToTestSuiteInfoMapper } from "./spec-response-to-test-suite-info-mapper";
import { KarmaTestRunner } from "./karma-test-runner";
import { TestRunnerFactory } from "../../../api/test-runner-factory";
import { Disposable } from "../../../api/disposable";

export class KarmaTestRunnerFactory implements TestRunnerFactory {

  private disposables: Disposable[] = [];
  
  public constructor(
    private readonly config: ExtensionConfig,
    private readonly logger: Logger)
  {
    this.disposables.push(config, logger);
  }

  public createTestRunner(
    karmaEventListener: KarmaEventListener,
    specToTestSuiteMapper: SpecResponseToTestSuiteInfoMapper,
    testRunExecutor?: TestRunExecutor): TestRunner
  {
    const runExecutor = testRunExecutor ?? this.createTestRunExecutor();
    return new KarmaTestRunner(runExecutor, karmaEventListener, specToTestSuiteMapper, this.logger);
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

  public dispose() {
    this.disposables.forEach(disposable => disposable.dispose());
  }
}
