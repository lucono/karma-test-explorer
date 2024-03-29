import { RequestOptions, request as httpRequest } from 'http';

import { TestRunExecutor } from '../../../api/test-run-executor.js';
import { Disposable } from '../../../util/disposable/disposable.js';
import { Disposer } from '../../../util/disposable/disposer.js';
import { DeferredExecution } from '../../../util/future/deferred-execution.js';
import { Execution } from '../../../util/future/execution.js';
import { Logger } from '../../../util/logging/logger.js';

const DEFAULT_RUN_OPTIONS = {
  refresh: true,
  urlRoot: '/run',
  hostname: 'localhost',
  clientArgs: []
};

export class KarmaHttpTestRunExecutor implements TestRunExecutor {
  private disposables: Disposable[] = [];

  public constructor(private readonly logger: Logger) {
    this.disposables.push(logger);
  }

  public executeTestRun(karmaPort: number, clientArgs: string[] = []): Execution {
    const deferredTestRunExecution = new DeferredExecution();

    const karmaRequestData = {
      // See: https://github.com/karma-runner/karma/blob/94cf15e8fa4420c8716998873b77f0c4f59b9e94/lib/runner.js#L100-L105
      args: clientArgs,
      refresh: DEFAULT_RUN_OPTIONS.refresh
    };

    const httpRequestOptions: RequestOptions = {
      hostname: DEFAULT_RUN_OPTIONS.hostname,
      path: DEFAULT_RUN_OPTIONS.urlRoot,
      port: karmaPort,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    };

    const request = httpRequest(httpRequestOptions, responseMessage => {
      responseMessage.resume();

      responseMessage.on('end', () => {
        if (!responseMessage.complete) {
          this.logger.error(() => `Test run http connection was terminated before receiving the full response`);
        }
      });
    });

    request.on('error', err => {
      let errorMsg = `Karma http request error: ${err}`;

      if ((err as any).code === 'ECONNREFUSED') {
        errorMsg = `No karma server listening on port ${httpRequestOptions.port}`;
      }

      this.logger.error(() => errorMsg);
      deferredTestRunExecution.fail(errorMsg);
    });

    request.on('close', () => {
      this.logger.debug(() => 'Karma http request closed');
      deferredTestRunExecution.end();
    });

    const karmaRequestContent = JSON.stringify(karmaRequestData);

    this.logger.debug(() => `Sending karma run http request with data: ${karmaRequestContent}`);

    deferredTestRunExecution.start();

    request.end(karmaRequestContent, () => {
      this.logger.debug(() => 'Finished sending http test run request');
    });

    // TODO: Consider adding auto-fail timeout for when http request taking too long

    return deferredTestRunExecution.execution();
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
