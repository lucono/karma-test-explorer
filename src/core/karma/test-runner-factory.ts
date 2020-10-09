import { TestRunner } from './test-runner';
import { HttpClientTestRunner } from './http-client-test-runner';
import { KarmaCliTestRunner } from './karma-cli-test-runner';
import { Logger } from "../helpers/logger";
import { KarmaEventListener } from "../integration/karma-event-listener";
import { TestExplorerConfiguration } from '../../model/test-explorer-configuration';
import { CommandlineProcessHandler } from '../integration/commandline-process-handler';

export class TestRunnerFactory {
    public constructor(
        private readonly testExplorerConfig: TestExplorerConfiguration,
        private readonly karmaEventListener: KarmaEventListener,
        private readonly logger: Logger
    ) {}

    public createTestRunner(): TestRunner {
        const useCliTestRunner = !!this.testExplorerConfig.karmaProcessExecutable;
        const cliTestRunProcessHandler = new CommandlineProcessHandler(this.karmaEventListener, this.logger);

        return useCliTestRunner
            ? new KarmaCliTestRunner(cliTestRunProcessHandler, this.karmaEventListener, this.logger)
            : new HttpClientTestRunner(this.karmaEventListener, this.logger);
    }
}
