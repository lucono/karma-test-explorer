// import { TestExplorerConfiguration } from "../../model/test-explorer-configuration";
import { Logger } from "../helpers/logger";
import { KarmaEventListener } from "../integration/karma-event-listener";
import { TestInfo, TestSuiteInfo } from "vscode-test-adapter-api";
import { SpecLocator } from "../helpers/spec-locator";
import { TestRunner } from "./test-runner";
import { request as httpRequest } from "http";
import { Execution, PromiseExecutor } from "../helpers/execution";
import { SpecCompleteResponse } from "../../model/spec-complete-response";
import { SpecResponseToTestSuiteInfoMapper } from "../test-explorer/spec-response-to-test-suite-info.mapper";
import { TestType } from "../../model/enums/test-type.enum";

const SKIP_ALL_TESTS_PATTERN = "$#%#";
const RUN_ALL_TESTS_PATTERN = "";

interface KarmaRunConfig {
  port: number,
  refresh: boolean,
  urlRoot: string,
  hostname: string,
  clientArgs: string[]
};

export class HttpClientTestRunner implements TestRunner {
  public constructor(
    private readonly karmaEventListener: KarmaEventListener,  // FIXME: Should not receive but own its own listener
    // private readonly testRetriever: KarmaTestRetriever,
    private readonly logger: Logger
  ) {}

  // public async loadTests(pathFinder: PathFinder, karmaPort: number): Promise<TestSuiteInfo> {
  //   // FIXME: Should create new listener for each test load which can also then used to run the tests

  //   const karmaRunConfig = this.createKarmaRunConfig(SKIP_ALL_TESTS_PATTERN, karmaPort);
  //   this.karmaEventListener.lastRunTest = "root";

  //   await this.callKarma(karmaRunConfig);
  //   return this.karmaEventListener.getLoadedTests(pathFinder);
  // }

  public async loadTests(specLocator: SpecLocator, karmaPort: number): Promise<TestSuiteInfo> {
    const testLoadExecution = {} as { start: PromiseExecutor<void>, stop: PromiseExecutor<void> };

    const testLoad: Execution = {
      started: new Promise((resolve, reject) => testLoadExecution.start = { resolve, reject }),
      stopped: new Promise((resolve, reject) => testLoadExecution.stop = { resolve, reject })
    };

    const futureLoadedSpecs = this.karmaEventListener.listenForTests(testLoad);
    const karmaRunConfig = this.createKarmaRunConfig(SKIP_ALL_TESTS_PATTERN, karmaPort);

    testLoadExecution.start.resolve();
    await this.callKarmaRun(karmaRunConfig);
    testLoadExecution.stop.resolve();

    const capturedSpecs: SpecCompleteResponse[] = await futureLoadedSpecs;
    const specToTestSuiteMapper = new SpecResponseToTestSuiteInfoMapper(specLocator, this.logger);
    return specToTestSuiteMapper.map(capturedSpecs);
  }

  public async runTests(tests: (TestInfo | TestSuiteInfo)[], karmaPort: number): Promise<void> {
    this.logger.info(
      `Requested ${tests.length} tests to run: ${JSON.stringify(tests.map(test => test.fullName))}`,
      { divider: "Karma Logs" });  // FIXME: what's divider?

    const runAllTests = tests.length === 0;
    let testList: (TestInfo | TestSuiteInfo)[];
    let aggregateTestPattern: string = SKIP_ALL_TESTS_PATTERN;

    if (runAllTests) {
      this.logger.debug(() => `Received empty test list - Will run all tests`);

      testList = [];
      aggregateTestPattern = RUN_ALL_TESTS_PATTERN;

    } else {
      testList = this.removeTestOverlaps(tests);
      this.logger.debug(() => `Resolved tests to run: ${JSON.stringify(testList.map(test => test.fullName))}`);
  
      const testPatterns: string[] = testList
        .filter(test => !!test.fullName)
        .map(test => {
          let testPattern: string = `^${this.escapeForRegExp(test.fullName)}`;
          if (test.type === TestType.Test) {
            testPattern = `${testPattern}$`;
          }
          return testPattern;
        });
      aggregateTestPattern = `/(${testPatterns.join("|")})/`;
    }

    const karmaRunConfig = this.createKarmaRunConfig(aggregateTestPattern, karmaPort);
    const testRunExecution = {} as { start: PromiseExecutor<void>, stop: PromiseExecutor<void> };

    const testRun: Execution = {
      started: new Promise((resolve, reject) => testRunExecution.start = { resolve, reject }),
      stopped: new Promise((resolve, reject) => testRunExecution.stop = { resolve, reject })
    };

    const testNames = testList.map(test => test.fullName);
    this.karmaEventListener.listenForTests(testRun, testNames);

    testRunExecution.start.resolve();
    await this.callKarmaRun(karmaRunConfig);
    testRunExecution.stop.resolve();
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

  private createKarmaRunConfig(testPattern: string, karmaPort: number): KarmaRunConfig {
    return {
      port: karmaPort,
      refresh: true,
      urlRoot: "/run",
      hostname: "localhost",
      clientArgs: [`--grep=${testPattern}`],
    };
  }

  private async callKarmaRun(config: KarmaRunConfig): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const options = {
        hostname: config.hostname,
        path: config.urlRoot,
        port: config.port,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      };

      const karmaRequestData = {
        args: config.clientArgs,
        refresh: config.refresh
        // removedFiles: config.removedFiles,
        // changedFiles: config.changedFiles,
        // addedFiles: config.addedFiles,
      };

      const request = httpRequest(options);

      request.on("error", (err) => {
        if ((err as any).code === "ECONNREFUSED") {
          reject(`Test runner: No karma server listening on port ${options.port}`);
        }
      });
      request.on("close", () => resolve());

      const karmaRequestContent = JSON.stringify(karmaRequestData);
      this.logger.info(`Sending karma request: ${karmaRequestContent}`);
      request.end(karmaRequestContent);
    });
  }

  private escapeForRegExp(stringValue: string) {
    // Taken from MDN: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#escaping
    return stringValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}