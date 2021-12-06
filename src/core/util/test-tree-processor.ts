import { TestInfo } from 'vscode-test-adapter-api';
import { Disposable } from '../../util/disposable/disposable';
import { Disposer } from '../../util/disposable/disposer';
import { Logger } from '../../util/logging/logger';
import { AnyTestInfo, TestType } from '../base/test-infos';

export class TestTreeProcessor implements Disposable {
  public constructor(private readonly logger: Logger) {}

  public processTestTree<S>(
    test: AnyTestInfo,
    testEvaluator: (test: TestInfo) => S,
    resultAggregator: (results: S[]) => S,
    testProcessor: (test: AnyTestInfo, result: S) => void
  ): S {
    const result =
      test.type === TestType.Test
        ? testEvaluator(test)
        : resultAggregator(
            test.children.map(child => this.processTestTree(child, testEvaluator, resultAggregator, testProcessor))
          );

    testProcessor(test, result);
    return result;
  }

  public async dispose() {
    await Disposer.dispose(this.logger);
  }
}
