import { TestSuiteInfo } from 'vscode-test-adapter-api';
import { TestGrouping } from '../../../core/base/test-grouping';
import { AnyTestInfo, TestType } from '../../../core/base/test-infos';
import { TestSuiteOrganizationOptions, TestSuiteOrganizer } from '../../../core/test-suite-organizer';
import { Disposable } from '../../../util/disposable/disposable';
import { Disposer } from '../../../util/disposable/disposer';
import { Logger } from '../../../util/logging/logger';
import { TestCountProcessor } from '../../../util/testing/test-count-processor';
import { SpecCompleteResponse } from './spec-complete-response';
import { SpecResponseToTestSuiteInfoMapper } from './spec-response-to-test-suite-info-mapper';

export class TestDiscoveryProcessor implements Disposable {
  private readonly disposables: Disposable[] = [];

  public constructor(
    private readonly specToTestSuiteMapper: SpecResponseToTestSuiteInfoMapper,
    private readonly testSuiteOrganizer: TestSuiteOrganizer,
    private readonly testCountProcessor: TestCountProcessor,
    private readonly testGrouping: TestGrouping,
    private readonly flattenSingleChildFolders: boolean,
    private readonly logger: Logger
  ) {
    this.disposables.push(logger);
  }

  public processTests(discoveredSpecs: SpecCompleteResponse[]): TestSuiteInfo {
    const mappedTestSuite: TestSuiteInfo = this.specToTestSuiteMapper.map(discoveredSpecs);

    const testOrganizationOptions: TestSuiteOrganizationOptions = {
      testGrouping: this.testGrouping,
      flattenSingleChildFolders: this.flattenSingleChildFolders
    };

    const discoveredTestSuite = this.testSuiteOrganizer.organizeTests(mappedTestSuite, testOrganizationOptions);

    const addTestCountToSuite = (test: AnyTestInfo, testCount: number) => {
      if (test.type === TestType.Suite) {
        test.testCount = testCount;
        test.description = testCount === 1 ? '(1 test)' : `(${testCount} tests)`;
      }
    };

    const totalTestCount = this.testCountProcessor.processTestSuite(discoveredTestSuite, addTestCountToSuite);

    this.logger.debug(() =>
      totalTestCount > 0
        ? `Test discovery - ${totalTestCount} total tests discovered from Karma`
        : 'Test discovery - No tests found'
    );

    return discoveredTestSuite;
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
