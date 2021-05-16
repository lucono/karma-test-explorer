import { TestRunner } from "./karma/test-runner";
import { KarmaEventListener } from "./integration/karma-event-listener";
import { Logger } from "./helpers/logger";
import { TestEvent, TestInfo, TestRunFinishedEvent, TestRunStartedEvent, TestSuiteEvent, TestSuiteInfo } from "vscode-test-adapter-api";
import { TestExplorerConfiguration } from "../model/test-explorer-configuration";
import { KarmaServer } from "./karma/karma-server";
import { getPorts as getAvailablePorts, getPortPromise as getAvailablePortPromise } from "portfinder";
import { Execution } from "./helpers/execution";
import { TestSuiteOrganizer } from "./test-explorer/test-suite-organizer";
import { TestGrouping, TestType } from "../model/enums/test-type.enum";
import { TestResults } from "./karma/karma-test-runner";
import { TestResult } from "../model/enums/test-status.enum";
import { TestSuiteState } from "../model/enums/test-suite-state.enum";
import * as vscode from "vscode";

export type TestResolver = (testId: string) => TestInfo | TestSuiteInfo | undefined;

export class KarmaTestExplorer {
  private testRunning: boolean = false;

  public constructor(
    private readonly karmaServer: KarmaServer,
    private readonly testRunner: TestRunner,
    private readonly karmaEventListener: KarmaEventListener,
    private readonly eventEmitterInterface: vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>,
    private readonly testSuiteOrganizer: TestSuiteOrganizer,
    private readonly testResolver: TestResolver,
    private readonly logger: Logger
  ) { }

  public async restart(config: TestExplorerConfiguration): Promise<void> {
    try {
      await this.stopCurrentRun();

      const serverKarmaPort = await getAvailablePortPromise({ port: config.karmaPort });

      const candidateKarmerListenerPorts: number[] = await new Promise((resolve, reject) => {
        getAvailablePorts(2, { port: config.defaultSocketConnectionPort }, (error: Error, ports: number[]) => {
            if (!error) {
              resolve(ports);
              return;
            }
            reject(`Failed to get available ports for karma listener socket: ${error.message ?? error}`)
          });
      });
      const karmerListenerSocketPort = candidateKarmerListenerPorts[0] !== serverKarmaPort
        ? candidateKarmerListenerPorts[0]
        : candidateKarmerListenerPorts[1];

      this.logger.info(`Using available karma port: ${config.karmaPort} --> ${serverKarmaPort}`);
      this.logger.info(`Using available karma listener socket port: ${config.defaultSocketConnectionPort} --> ${karmerListenerSocketPort}`);

      const karmaServerExecution: Execution = await this.karmaServer.start(serverKarmaPort, config, {
        karmaSocketPort: `${karmerListenerSocketPort}`
      });

      await new Promise<void>((resolve, reject) => {
        this.karmaEventListener.acceptKarmaConnection(karmerListenerSocketPort)
          .then(() => resolve())
          .catch(failureReason => reject(`${failureReason}`));
        
          karmaServerExecution.stopped.then(() => reject(`Karma server quit prematurely`));
      });
    } catch (error) {
      this.logger.error(`Failed to load tests: ${error}`);
      await this.stopCurrentRun();
      throw error;
    }
  }

  public async loadTests(config: TestExplorerConfiguration): Promise<TestSuiteInfo> {
    try {
      if (!this.isSystemsRunning()) {
        this.logger.info(
          `Request to load tests - ` +
          `karma server is ${!this.karmaServer.isRunning() ? 'not' : ''} running, and ` +
          `karma listener is ${!this.karmaEventListener.isRunning() ? 'not' : ''} running - ` +
          `Restarting both`);

        await this.restart(config);
      }
      
      this.logger.info("Proceeding to load tests");

      const karmaPort = this.karmaServer.getServerPort()!;
      let testSuiteInfo: TestSuiteInfo = await this.testRunner.loadTests(karmaPort, config);

      if (config.testGrouping === TestGrouping.Folder) {
        testSuiteInfo = this.testSuiteOrganizer.groupByFolder(testSuiteInfo, config.projectRootPath);
      }

      const totalTestCount = this.processTestCounts(testSuiteInfo, (testSuite, testCount) => {
        testSuite.testCount = testCount;
        testSuite.description = `(${testCount} ${testCount === 1 ? 'test' : 'tests'})`;
      });

      this.logger.info(totalTestCount > 0
        ? `Test loading - ${totalTestCount} total tests loaded from Karma`
        : `Test loading - No tests found`);

      return testSuiteInfo;
      
    } catch (error) {
      const failureMessage = `Test loading failed: ${error.message ?? error}`;
      this.logger.error(failureMessage);
      throw new Error(failureMessage);
    }
  }

  public async runTests(config: TestExplorerConfiguration, tests: (TestInfo | TestSuiteInfo)[]): Promise<void> {
    try {
      if (!this.isSystemsRunning()) {
        this.logger.info(`Request to run tests - ` +
          `karma server is ${!this.karmaServer.isRunning() ? 'not' : ''} running, and ` +
          `karma listener is ${!this.karmaEventListener.isRunning() ? 'not' : ''} running - ` +
          `Restarting both`);

        await this.restart(config);
      }
      
      this.logger.info("Proceeding to run tests");

      this.testRunning = true;
      const karmaPort: number = this.karmaServer.getServerPort()!;
      const uniqueTests = this.removeTestOverlaps(tests);

      const testResults: TestResults = await this.testRunner.runTests(uniqueTests, karmaPort, config);
      this.handleTestSuiteResults(testResults, config.testGrouping, config.projectRootPath);

    } finally {
      this.testRunning = false;
    }
  }

  private handleTestSuiteResults(testResults: TestResults, testGrouping: TestGrouping, projectRootPath: string) {
    if (testGrouping === TestGrouping.Folder) {
      Object.values(TestResult).forEach(testResult => {
        testResults[testResult] = this.testSuiteOrganizer.groupByFolder(testResults[testResult], projectRootPath, false);
      });
    }
    const testCountsBySuiteId: Map<string, { [key in TestResult]?: number }> = new Map();

    const testCountProcessor = (testSuite: TestSuiteInfo, testCount: number, testResult: TestResult) => {
      const testCounts = testCountsBySuiteId.get(testSuite.id) ?? {};
      testCounts[testResult] = testCount;
      testCountsBySuiteId.set(testSuite.id, testCounts);
    };

    const totalTestCounts: { [key in TestResult]?: number } = {};

    Object.values(TestResult).forEach(testResult => {
      totalTestCounts[testResult] = this.processTestCounts(testResults[testResult], (testSuite, testCount) => {
        testCountProcessor(testSuite, testCount, testResult);
      });
    });

    this.logger.info(
      `Test run - ` +
      `${totalTestCounts[TestResult.Failed] ?? 0} total tests failed, ` +
      `${totalTestCounts[TestResult.Success] ?? 0} total tests passed, ` +
      `${totalTestCounts[TestResult.Skipped] ?? 0} total tests skipped`);
    
    for (const testSuiteId of testCountsBySuiteId.keys()) {
      const test: TestInfo | TestSuiteInfo | undefined = this.testResolver(testSuiteId);
      const testSuite: TestSuiteInfo | undefined = test?.type === TestType.Suite ? test : undefined;

      if (!testSuite) {
        continue;
      }
      const testCounts: { [key in TestResult]?: number } = testCountsBySuiteId.get(testSuiteId)!;
      const failedTestCount = testCounts[TestResult.Failed] ?? 0;
      const passedTestCount = testCounts[TestResult.Success] ?? 0;
      const skippedTestCount = testCounts[TestResult.Skipped] ?? 0;

      const totalSuiteTestCount = testSuite.testCount;
      const executedSuiteTestCount = failedTestCount + passedTestCount + skippedTestCount;
      const suiteExecutedAllTests = executedSuiteTestCount === totalSuiteTestCount;

      if (suiteExecutedAllTests) {
        let testResultDescription = '';
        
        if (skippedTestCount === totalSuiteTestCount) {
          testResultDescription = `${skippedTestCount} of ${totalSuiteTestCount} tests skipped`;
        } else if (failedTestCount === totalSuiteTestCount || passedTestCount === 0) {
          testResultDescription = `${failedTestCount} of ${totalSuiteTestCount} tests failed`;
        } else if (passedTestCount === totalSuiteTestCount || failedTestCount === 0) {
          testResultDescription = `${passedTestCount} of ${totalSuiteTestCount} tests passed`;
        } else {
          testResultDescription = `${totalSuiteTestCount} tests, ${failedTestCount} failed, ${passedTestCount} passed`;
        }
        
        if (skippedTestCount > 0 && skippedTestCount < totalSuiteTestCount) {
          testResultDescription = `${testResultDescription}, ${skippedTestCount} skipped`;
        }
        
        const testEvent: TestSuiteEvent = {
          type: TestType.Suite,
          suite: testSuiteId,
          state: TestSuiteState.Completed,
          description: `(${testResultDescription})`,
          tooltip: `${testSuite?.tooltip}  (${testResultDescription})`
        };

        this.eventEmitterInterface.fire(testEvent);
      }
    }
  }

  public async stopCurrentRun(): Promise<void> {
    if (this.karmaEventListener.isRunning()) {
      await this.karmaEventListener.stop();
    }

    if (this.karmaServer.isRunning()) {
      // FIXME: Should this use stop() instead of kill()?
      // Which one best guarantees termination of both karma
      // and its launched browser/s without leaving any orphans?
      await this.karmaServer.kill();
    }
  }

  private processTestCounts(
    testSuite: TestSuiteInfo,
    testCountProcessor: (test: TestSuiteInfo, totalTestCount: number) => void): number
  {
    let totalTestCount = 0;

    if (testSuite.children) {
      testSuite.children.forEach(testOrSuite => {
        totalTestCount += testOrSuite.type === TestType.Test ? 1
          : this.processTestCounts(testOrSuite, testCountProcessor);
      });
    }
    testCountProcessor(testSuite, totalTestCount);
    return totalTestCount;
  }

  private removeTestOverlaps(tests: (TestInfo | TestSuiteInfo)[]): (TestInfo | TestSuiteInfo)[] {
    const resolvedTests = new Set(tests);

    const removeDuplicates = (test: TestInfo | TestSuiteInfo) => {
      if (resolvedTests.has(test)) {
        resolvedTests.delete(test);
      }
      if (test.type === TestType.Suite) {
        test.children.forEach(childTest => removeDuplicates(childTest));
      }
    }

    tests.forEach(test => {
      if (resolvedTests.has(test) && test.type === TestType.Suite) {
        test.children.forEach(childTest => removeDuplicates(childTest))
      };
    });

    return [ ...resolvedTests ];
  }

  public isTestRunning(): boolean {
    return this.testRunning;
  }

  private isSystemsRunning(): boolean {
    return this.karmaServer.isRunning() && this.karmaEventListener.isRunning();
  }

  public dispose(): void {
    this.stopCurrentRun();
  }
}
