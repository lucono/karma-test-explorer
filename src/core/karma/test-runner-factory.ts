import { TestRunner } from './test-runner';
import { HttpClientTestRunner } from './http-client-test-runner';
import { CommandLineTestRunner } from './command-line-test-runner';
import { Logger } from "../helpers/logger";
import { KarmaEventListener } from "../integration/karma-event-listener";
import { SpecResponseToTestSuiteInfoMapper } from '../test-explorer/spec-response-to-test-suite-info-mapper';
import { TestExplorerConfiguration } from '../../model/test-explorer-configuration';
import { accessSync, constants } from "fs";

export class TestRunnerFactory {
    public constructor(
        private readonly karmaEventListener: KarmaEventListener,
        private readonly specToTestSuiteMapper: SpecResponseToTestSuiteInfoMapper,
        private readonly logger: Logger
    ) {}

    public createTestRunner(testExplorerConfig: TestExplorerConfiguration): TestRunner {
        const karmaProcessExecutable: string = testExplorerConfig.karmaProcessExecutable;
        let useCliTestRunner = false;
        
        try {
            if (karmaProcessExecutable) {
                accessSync(karmaProcessExecutable, constants.X_OK);
                useCliTestRunner = true;
            }
        } catch (error) {
            this.logger.error(
                `Not able to execute specified Karma process executable '${karmaProcessExecutable}': ` +
                `${error.message ?? error}`);
        }

        return useCliTestRunner
            ? new CommandLineTestRunner(this.karmaEventListener, this.specToTestSuiteMapper, this.logger)
            : new HttpClientTestRunner(this.karmaEventListener, this.specToTestSuiteMapper, this.logger);
    }
}
