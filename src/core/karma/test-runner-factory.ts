import { TestRunner } from './test-runner';
import { HttpClientTestRunner } from './http-client-test-runner';
import { KarmaCliTestRunner } from './karma-cli-test-runner';
import { Logger } from "../helpers/logger";
import { KarmaEventListener } from "../integration/karma-event-listener";

const USE_CLI_TEST_RUNNER = true;

export class TestRunnerFactory {
    public constructor(
        private readonly karmaEventListener: KarmaEventListener,
        private readonly karmaPort: number,
        private readonly logger: Logger
    ) {}

    public createTestRunner(): TestRunner {
        return USE_CLI_TEST_RUNNER
            ? new KarmaCliTestRunner(this.karmaEventListener, this.karmaPort, this.logger)
            : new HttpClientTestRunner(this.karmaEventListener, this.karmaPort, this.logger);
    }
}
