import { TestInfo, TestSuiteInfo } from 'vscode-test-adapter-api';

import { AnyTestInfo, TestType } from '../../../core/base/test-infos.js';
import { TestSuiteOrganizer } from '../../../core/util/test-suite-organizer.js';
import { TestTreeProcessor } from '../../../core/util/test-tree-processor.js';
import { MessageType, NotificationHandler } from '../../../core/vscode/notifications/notification-handler.js';
import { Disposable } from '../../../util/disposable/disposable.js';
import { Disposer } from '../../../util/disposable/disposer.js';
import { Logger } from '../../../util/logging/logger.js';
import { SpecCompleteResponse } from './spec-complete-response.js';
import { TestBuilder } from './test-builder.js';

interface TestDiscoveryCount {
  focused: number;
  disabled: number;
  total: number;
}

export class TestDiscoveryProcessor implements Disposable {
  private readonly disposables: Disposable[] = [];

  public constructor(
    private readonly testBuilder: TestBuilder,
    private readonly testSuiteOrganizer: TestSuiteOrganizer,
    private readonly testTreeProcessor: TestTreeProcessor,
    private readonly notificationHandler: NotificationHandler,
    private readonly logger: Logger
  ) {
    this.disposables.push(logger);
  }

  public processTests(discoveredSpecs: SpecCompleteResponse[]): TestSuiteInfo {
    const builtTests = this.testBuilder.buildTests(discoveredSpecs);
    const allTestsAreFiltered = discoveredSpecs.length > 0 && builtTests.length === 0;

    if (allTestsAreFiltered) {
      const allTestsFilteredMessage =
        `There are no tests to display because all tests are currently filtered. ` +
        `Try adjusting your test filtering settings.`;

      this.notificationHandler.notify(MessageType.Error, allTestsFilteredMessage, undefined, {
        dismissAction: true,
        showLogAction: false
      });

      return this.createEmptySuite();
    }

    const discoveredTestSuite = this.testSuiteOrganizer.organizeTests(builtTests);

    const testCountEvaluator = (test: TestInfo): TestDiscoveryCount => ({
      focused: test.activeState === 'focused' || test.activeState === 'focusedIn' ? 1 : 0,
      disabled: test.activeState === 'disabled' || test.activeState === 'disabledOut' ? 1 : 0,
      total: 1
    });

    const testCountReducer = (testCount1: TestDiscoveryCount, testCount2: TestDiscoveryCount) => ({
      focused: testCount1.focused + testCount2.focused,
      disabled: testCount1.disabled + testCount2.disabled,
      total: testCount1.total + testCount2.total
    });

    const testCountAggregator = (testCounts: TestDiscoveryCount[]) => {
      return testCounts.reduce(testCountReducer, { focused: 0, disabled: 0, total: 0 });
    };

    const testCountUpdater = (test: AnyTestInfo, testCount: TestDiscoveryCount) => {
      if (test.type === TestType.Suite) {
        const totalCount = testCount.total;
        const focusedCount = testCount.focused;
        const disabledCount = testCount.disabled;

        const totalCountDescription = totalCount === 1 ? '1 test' : `${totalCount} tests`;

        const allCountsDescription =
          focusedCount === 0 && disabledCount === 0
            ? `${totalCountDescription}`
            : focusedCount === totalCount
            ? `${totalCountDescription}, all focused`
            : disabledCount === totalCount
            ? `${totalCountDescription}, all disabled`
            : `${totalCountDescription}` +
              (focusedCount > 0 ? `, ${focusedCount} focused` : '') +
              (disabledCount > 0 ? `, ${disabledCount} disabled` : '');

        test.testCount = testCount.total;
        test.description = `(${allCountsDescription})`;
      }
    };

    const fullTestCount = this.testTreeProcessor.processTestTree(
      discoveredTestSuite,
      testCountEvaluator,
      testCountAggregator,
      testCountUpdater
    );

    this.logger.debug(() =>
      fullTestCount.total > 0
        ? `Test discovery - ${fullTestCount.total} total tests discovered from Karma`
        : 'Test discovery - No tests found'
    );

    return discoveredTestSuite;
  }

  private createEmptySuite(): TestSuiteInfo {
    const placeholderSuite: TestSuiteInfo = {
      type: TestType.Suite,
      id: ':',
      label: 'All tests filtered',
      name: '',
      fullName: '',
      children: [],
      testCount: 0,
      activeState: 'default'
    };
    return placeholderSuite;
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
