import { Logger } from "../helpers/logger";
import { TestExplorerConfiguration } from '../../model/test-explorer-configuration';
import { KarmaRunConfig, TestRunExecutor } from './test-run-executor';
import { KarmaCommandLineTestExecutor } from './karma-command-line-test-executor';
import { KarmaHttpClientTestExecutor } from './karma-http-client-test-executor';

export class KarmaTestExecutor implements TestRunExecutor {

  public constructor(
    private readonly httpClientTestExecutor: KarmaHttpClientTestExecutor,
    private readonly commandLineTestExecutor: KarmaCommandLineTestExecutor,
    private readonly logger: Logger
  ) {}

  public async executeTestRun(karmaRunConfig: KarmaRunConfig, explorerConfig: TestExplorerConfiguration): Promise<void> {
    const userKarmaExecutable = explorerConfig.karmaProcessExecutable;
    let testExecutor: TestRunExecutor = this.httpClientTestExecutor;

    if (userKarmaExecutable) {
      testExecutor = this.commandLineTestExecutor;
      this.logger.debug(() => `Using command line test executor for execution request: ${JSON.stringify(karmaRunConfig)}`);
    }
    return testExecutor.executeTestRun(karmaRunConfig, explorerConfig);
  }
}
