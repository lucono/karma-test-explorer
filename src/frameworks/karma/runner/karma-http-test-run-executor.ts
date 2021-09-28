import { request as httpRequest, RequestOptions } from 'http';
import { TestRunExecutor } from '../../../api/test-run-executor';
import { Disposable } from '../../../util/disposable/disposable';
import { Disposer } from '../../../util/disposable/disposer';
import { DeferredExecution } from '../../../util/future/deferred-execution';
import { Execution } from '../../../util/future/execution';
import { Logger } from '../../../util/logging/logger';

const defaultRunOptions = {
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
      refresh: defaultRunOptions.refresh
    };

    const httpRequestOptions: RequestOptions = {
      hostname: defaultRunOptions.hostname,
      path: defaultRunOptions.urlRoot,
      port: karmaPort,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    };

    const request = httpRequest(httpRequestOptions);

    request.on('error', err => {
      if ((err as any).code === 'ECONNREFUSED') {
        deferredTestRunExecution.fail(`Test runner: No karma server listening on port ${httpRequestOptions.port}`);
      }
    });
    request.on('close', () => deferredTestRunExecution.end());

    const karmaRequestContent = JSON.stringify(karmaRequestData);

    this.logger.debug(() => 'Sending karma request');
    this.logger.trace(() => `Karma request data to be sent: ${karmaRequestContent}`);

    request.end(karmaRequestContent);

    deferredTestRunExecution.start();

    // TODO: Consider adding auto-fail timeout for when http request taking too long

    return deferredTestRunExecution.execution();
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
