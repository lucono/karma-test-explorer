import { TestRunner } from '../../a-new-structure/api/test-runner';
import { KarmaTestRunner } from '../../a-new-structure/frameworks/karma/karma-test-runner';
import { Logger } from "../../a-new-structure/util/logger";
import { KarmaEventListener } from "../../a-new-structure/frameworks/karma/integration/karma-event-listener";
import { SpecResponseToTestSuiteInfoMapper } from '../../a-new-structure/frameworks/karma/integration/spec-response-to-test-suite-info-mapper';
import { KarmaTestExecutor } from './karma-test-executor';
import { ServerCommandHandler } from './server-command-handler';
import { TestRunExecutor } from '../../a-new-structure/api/test-run-executor';

export class TestRunnerFactory {

  public constructor(
    private readonly serverCommandHandler: ServerCommandHandler,
    private readonly karmaEventListener: KarmaEventListener,
    private readonly specToTestSuiteMapper: SpecResponseToTestSuiteInfoMapper,
    private readonly logger: Logger
  ) {}

  public createTestRunner(): TestRunner {
    const testRunExecutor: TestRunExecutor = new KarmaTestExecutor(this.serverCommandHandler, this.logger);
    return new KarmaTestRunner(testRunExecutor, this.karmaEventListener, this.specToTestSuiteMapper, this.logger);
  }
}
