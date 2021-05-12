import { TestRunner } from './test-runner';
import { KarmaTestRunner } from './karma-test-runner';
import { Logger } from "../helpers/logger";
import { KarmaEventListener } from "../integration/karma-event-listener";
import { SpecResponseToTestSuiteInfoMapper } from '../test-explorer/spec-response-to-test-suite-info-mapper';
import { TestRunExecutor } from './test-run-executor';
import { KarmaCommandLineTestExecutor } from './karma-command-line-test-executor';
import { KarmaHttpClientTestExecutor } from './karma-http-client-test-executor';
import { KarmaTestExecutor } from './karma-test-executor';

export class TestRunnerFactory {

  public constructor(
    private readonly karmaEventListener: KarmaEventListener,
    private readonly specToTestSuiteMapper: SpecResponseToTestSuiteInfoMapper,
    private readonly logger: Logger
  ) {}

  public createTestRunner(): TestRunner {
    const testRunExecutor: TestRunExecutor = new KarmaTestExecutor(
      new KarmaHttpClientTestExecutor(this.logger),
      new KarmaCommandLineTestExecutor(this.logger),
      this.logger);

    return new KarmaTestRunner(testRunExecutor, this.karmaEventListener, this.specToTestSuiteMapper, this.logger);
  }
}
