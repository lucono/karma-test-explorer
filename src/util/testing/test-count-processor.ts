import { TestSuiteInfo } from 'vscode-test-adapter-api';
import { AnyTestInfo } from '../../core/base/test-infos';
import { Disposable } from '../disposable/disposable';
import { Disposer } from '../disposable/disposer';
import { Logger } from '../logging/logger';
import { TestTreeProcessor } from './test-tree-processor';

export class TestCountProcessor implements Disposable {
  public constructor(private readonly testTreeProcessor: TestTreeProcessor, private readonly logger: Logger) {}

  public processTestSuite(
    discoveredTestSuite: TestSuiteInfo,
    testProcessor: (test: AnyTestInfo, testCount: number) => void
  ): number {
    const countAggregator = (runningTestCount: number, nextSuiteTestCount: number) => {
      return runningTestCount + nextSuiteTestCount;
    };

    const totalTestCount = this.testTreeProcessor.processTestSuite(
      discoveredTestSuite,
      1,
      0,
      testProcessor,
      countAggregator
    );

    return totalTestCount;
  }

  public async dispose() {
    await Disposer.dispose(this.logger);
  }
}
