import { AnyTestInfo, TestType } from '../../core/base/test-infos';
import { Disposable } from '../disposable/disposable';
import { Disposer } from '../disposable/disposer';
import { Logger } from '../logging/logger';

export class TestTreeProcessor implements Disposable {
  public constructor(private readonly logger: Logger) {}

  public processTestSuite<S>(
    test: AnyTestInfo,
    singleTestValue: S,
    emptySuiteValue: S,
    testProcessor: (test: AnyTestInfo, result: S) => void,
    aggregator: (aggregate: S, newItem: S) => S
  ): S {
    const result =
      test.type === TestType.Test
        ? singleTestValue
        : test.children.length > 0
        ? test.children
            .map((child: AnyTestInfo) =>
              this.processTestSuite(child, singleTestValue, emptySuiteValue, testProcessor, aggregator)
            )
            .reduce(aggregator)
        : emptySuiteValue;

    testProcessor(test, result);
    return result;
  }

  public async dispose() {
    await Disposer.dispose(this.logger);
  }
}
