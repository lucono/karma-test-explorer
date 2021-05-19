import { Logger } from "../../a-new-structure/util/logger";
import { ExtensionConfig } from '../../a-new-structure/core/extension-config';
import { KarmaRunConfig, TestRunExecutor } from './test-run-executor';
import { request as httpRequest, RequestOptions } from "http";
import { CommandlineProcessHandler } from "../../a-new-structure/util/commandline-process-handler";
import { ServerCommandHandler } from "./server-command-handler";

export class KarmaTestExecutor implements TestRunExecutor {

  public constructor(
    private readonly serverCommandHandler: ServerCommandHandler,
    private readonly explorerConfig: ExtensionConfig,
    private readonly logger: Logger
  ) {}

  public async executeTestRun(karmaRunConfig: KarmaRunConfig): Promise<void> {
    const karmaProcessExecutable = this.explorerConfig.karmaProcessExecutable;
    let testRunCompletion: Promise<void> | undefined;

    if (karmaProcessExecutable) {
      this.logger.debug(() => 
        `Using command line test executor '${karmaProcessExecutable}' ` +
        `for execution request: ${JSON.stringify(karmaRunConfig)}`);

      testRunCompletion = this.executeCommandLineTestRun(karmaRunConfig);

    } else {
      testRunCompletion = this.executeHttpClientTestRun(karmaRunConfig);
    }
    return testRunCompletion;
  }

  private async executeCommandLineTestRun(karmaRunConfig: KarmaRunConfig): Promise<void>
  {
    const karmaRunProcess: CommandlineProcessHandler = this.serverCommandHandler.run(
      karmaRunConfig.port,
      karmaRunConfig.clientArgs);
    
    return karmaRunProcess.execution().stopped;
  }

  private async executeHttpClientTestRun(karmaRunConfig: KarmaRunConfig): Promise<void> {
    // See: https://github.com/karma-runner/karma/blob/94cf15e8fa4420c8716998873b77f0c4f59b9e94/lib/runner.js#L100-L105
    const karmaRequestData = {
      args: karmaRunConfig.clientArgs,
      refresh: karmaRunConfig.refresh
    };

    const httpRequestOptions: RequestOptions = {
      hostname: karmaRunConfig.hostname,
      path: karmaRunConfig.urlRoot,
      port: karmaRunConfig.port,
      method: "POST",
      headers: { "Content-Type": "application/json" },
    };

    return new Promise<void>((resolve, reject) => {
      const request = httpRequest(httpRequestOptions);

      request.on("error", (err) => {
        if ((err as any).code === "ECONNREFUSED") {
          reject(`Test runner: No karma server listening on port ${httpRequestOptions.port}`);
        }
      });
      request.on("close", () => resolve());

      const karmaRequestContent = JSON.stringify(karmaRequestData);
      this.logger.debug(() => `Sending karma request: ${karmaRequestContent}`);
      request.end(karmaRequestContent);
    });
  }
}

