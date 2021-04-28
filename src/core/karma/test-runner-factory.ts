import { TestRunner } from './test-runner';
import { HttpClientTestRunner } from './http-client-test-runner';
import { KarmaCliTestRunner } from './karma-cli-test-runner';
import { Logger } from "../helpers/logger";
import { KarmaEventListener } from "../integration/karma-event-listener";
import { TestExplorerConfiguration } from '../../model/test-explorer-configuration';

export class TestRunnerFactory {
    public constructor(
        private readonly testExplorerConfig: TestExplorerConfiguration,
        private readonly karmaEventListener: KarmaEventListener,
        private readonly logger: Logger
    ) {}

    public createTestRunner(): TestRunner {
        const useCliTestRunner = !!this.testExplorerConfig.karmaProcessExecutable;

        return useCliTestRunner
            ? new KarmaCliTestRunner(this.karmaEventListener, this.testExplorerConfig.karmaPort, this.logger)
            : new HttpClientTestRunner(this.karmaEventListener, this.testExplorerConfig.karmaPort, this.logger);
    }
}
