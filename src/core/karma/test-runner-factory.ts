import { TestRunner } from './test-runner';
import { KarmaTestRunner } from './karma-test-runner';
import { Logger } from "../helpers/logger";
import { KarmaEventListener } from "../integration/karma-event-listener";
import { SpecResponseToTestSuiteInfoMapper } from '../test-explorer/spec-response-to-test-suite-info-mapper';
import { TestExplorerConfiguration } from '../../model/test-explorer-configuration';
import { accessSync, constants } from "fs";
import { TestRunExecutor } from './test-run-executor';
import { KarmaCommandLineTestExecutor } from './karma-command-line-test-executor';
import { KarmaHttpClientTestExecutor } from './karma-http-client-test-executor';

export class TestRunnerFactory {

  public constructor(
    private readonly karmaEventListener: KarmaEventListener,
    private readonly specToTestSuiteMapper: SpecResponseToTestSuiteInfoMapper,
    private readonly logger: Logger
  ) {}

  public createTestRunner(testExplorerConfig: TestExplorerConfiguration): TestRunner {
    const karmaProcessExecutable: string = testExplorerConfig.karmaProcessExecutable;
    let useCliTestRunner = false;
    
    if (karmaProcessExecutable) {
      try {
        accessSync(karmaProcessExecutable, constants.X_OK);
        useCliTestRunner = true;
      } catch (error) {
        this.logger.error(
          `Not able to execute specified Karma process executable '${karmaProcessExecutable}': ` +
          `${error.message ?? error}`);
      }
    }

    const testRunExecutor: TestRunExecutor = useCliTestRunner
      ? new KarmaCommandLineTestExecutor(this.logger)
      : new KarmaHttpClientTestExecutor(this.logger);

    return new KarmaTestRunner(testRunExecutor, this.karmaEventListener, this.specToTestSuiteMapper, this.logger);
  }
}
