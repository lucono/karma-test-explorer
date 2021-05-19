import { Logger } from "../../util/logger";
import { ExtensionConfig } from "../../core/extension-config";
import { TestRunExecutor } from "../../api/test-run-executor";
import { TestServerExecutor } from "../../api/test-server-executor";
import { KarmaCommandLineExecutor } from "./karma-command-line-executor";
import { KarmaHttpTestRunExecutor } from "./karma-http-test-run-executor";
import { TestRunner } from "../../api/test-runner";
import { KarmaEventListener } from "./integration/karma-event-listener";
import { SpecResponseToTestSuiteInfoMapper } from "./integration/spec-response-to-test-suite-info-mapper";
import { KarmaTestRunner } from "./karma-test-runner";

export class KarmaFactory {

  public constructor(
    private readonly config: ExtensionConfig,
    private readonly logger: Logger
  ) {}

  public createTestRunner(
    testRunExecutor: TestRunExecutor,
    karmaEventListener: KarmaEventListener,
    specToTestSuiteMapper: SpecResponseToTestSuiteInfoMapper): TestRunner
  {
    return new KarmaTestRunner(testRunExecutor, karmaEventListener, specToTestSuiteMapper, this.logger);
  }

  public createTestServerExecutor(): TestServerExecutor {
    return new KarmaCommandLineExecutor(this.config, this.logger);
  }

  public createTestRunExecutor(): TestRunExecutor {
    let testRunExecutor: TestRunExecutor;

    if (this.config.karmaProcessExecutable) {
      this.logger.info( 
        `Using Karma command line test run executor ` +
        `because karma process command is specified: ` +
        `${this.config.karmaProcessExecutable}`);

        testRunExecutor = new KarmaCommandLineExecutor(this.config, this.logger);

    } else {
      this.logger.info( 
        `Using Karma http test run executorbecause  ` +
        `no karma process command is specified`);

        testRunExecutor = new KarmaHttpTestRunExecutor(this.logger);
    }
    return testRunExecutor;
  }
}
