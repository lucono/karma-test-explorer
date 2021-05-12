import { Logger } from "../helpers/logger";
import { TestExplorerConfiguration } from "../../model/test-explorer-configuration";
import { KarmaRunConfig, TestRunExecutor } from "./test-run-executor";
import { request as httpRequest, RequestOptions } from "http";

export class KarmaHttpClientTestExecutor implements TestRunExecutor {

  public constructor(private readonly logger: Logger) {}

  public async executeTestRun(karmaRunConfig: KarmaRunConfig, explorerConfig: TestExplorerConfiguration): Promise<void> {
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