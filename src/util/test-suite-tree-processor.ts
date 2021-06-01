import { Disposable } from "../api/disposable";
import { AnyTestInfo, TestType } from "../api/test-infos";
import { Logger } from "../core/logger";

export class TestSuiteTreeProcessor implements Disposable {

  public constructor(private readonly logger: Logger) {}

  public processTestSuite<S>(
    test: AnyTestInfo,
    singleTestValue: S,
    emptySuiteValue: S,
    testProcessor: (test: AnyTestInfo, result: S) => void,
    aggregator: (aggregate: S, newItem: S) => S): S
  {
    const result = test.type === TestType.Test ? singleTestValue
      : test.children.length > 0 ? test.children
        .map((child: AnyTestInfo) => this.processTestSuite(child, singleTestValue, emptySuiteValue, testProcessor, aggregator))
        .reduce(aggregator)
      : emptySuiteValue;
    
    testProcessor(test, result);
    return result;
  }

  public dispose() {
    this.logger.dispose();
  }
}
