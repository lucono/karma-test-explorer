import { TestRunner } from './test-runner';
import { HttpClientTestRunner } from './http-client-test-runner';
// import { KarmaCliTestRunner } from './karma-cli-test-runner';
import { Logger } from "../helpers/logger";
import { KarmaEventListener } from "../integration/karma-event-listener";
import { SpecResponseToTestSuiteInfoMapper } from '../test-explorer/spec-response-to-test-suite-info-mapper';
// import { TestExplorerConfiguration } from '../../model/test-explorer-configuration';

export class TestRunnerFactory {
    public constructor(
        // private readonly testExplorerConfig: TestExplorerConfiguration,
        private readonly karmaEventListener: KarmaEventListener,
        private readonly specToTestSuiteMapper: SpecResponseToTestSuiteInfoMapper,
        private readonly logger: Logger
    ) {}

    public createTestRunner(): TestRunner {
        // const useCliTestRunner = !!this.testExplorerConfig.karmaProcessExecutable;

        // return useCliTestRunner
        //     ? new KarmaCliTestRunner(this.karmaEventListener, this.logger)
        //     : new HttpClientTestRunner(this.karmaEventListener, this.logger);

        return new HttpClientTestRunner(this.karmaEventListener, this.specToTestSuiteMapper, this.logger);
    }
}
