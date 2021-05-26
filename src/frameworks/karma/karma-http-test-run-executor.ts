
import { request as httpRequest, RequestOptions } from "http";
import { DeferredPromise } from "../../util/deferred-promise";
import { Logger } from "../../util/logger";
import { Execution } from "../../api/execution";
import { TestRunExecutor } from "../../api/test-run-executor";
import { SKIP_ALL_TESTS_PATTERN } from "./karma-constants";

const defaultRunOptions = {
  refresh: true,
  urlRoot: "/run",
  hostname: "localhost",
  clientArgs: [`--grep=/${SKIP_ALL_TESTS_PATTERN}/`],
};

export class KarmaHttpTestRunExecutor implements TestRunExecutor {

  public constructor(
    private readonly logger: Logger
  ) {}

  public executeTestRun(karmaPort: number, clientArgs: string[] = []): Execution {
    const testRunFinishedDeferred: DeferredPromise = new DeferredPromise();

    const testRunStartedPromise = new Promise<void>(resolve => {
      // See: https://github.com/karma-runner/karma/blob/94cf15e8fa4420c8716998873b77f0c4f59b9e94/lib/runner.js#L100-L105
      const karmaRequestData = {
        args: clientArgs,
        refresh: defaultRunOptions.refresh
      };
  
      const httpRequestOptions: RequestOptions = {
        hostname: defaultRunOptions.hostname,
        path: defaultRunOptions.urlRoot,
        port: karmaPort,
        method: "POST",
        headers: { "Content-Type": "application/json" },
      };
      
      const request = httpRequest(httpRequestOptions);

      request.on("error", (err) => {
        if ((err as any).code === "ECONNREFUSED") {
          testRunFinishedDeferred.reject(`Test runner: No karma server listening on port ${httpRequestOptions.port}`);
        }
      });
      request.on("close", () => testRunFinishedDeferred.resolve());

      const karmaRequestContent = JSON.stringify(karmaRequestData);
      this.logger.debug(() => `Sending karma request: ${karmaRequestContent}`);
      request.end(karmaRequestContent);
      resolve();
    });

    const testRunExecution: Execution = {
      started: () => testRunStartedPromise,
      ended: () => testRunFinishedDeferred.promise()
    };

    return testRunExecution;
  }
}
    
    