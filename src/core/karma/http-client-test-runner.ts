// import { TestExplorerConfiguration } from "../../model/test-explorer-configuration";
import { Logger } from "../helpers/logger";
import { KarmaEventListener } from "../integration/karma-event-listener";
import { TestInfo, TestSuiteInfo, TestType } from "vscode-test-adapter-api";
import { PathFinder } from "../helpers/path-finder";
import { TestRunner } from "./test-runner";
import { request as httpRequest } from "http";
import { Execution, PromiseExecutor } from "../helpers/execution";
import { SpecCompleteResponse } from "../../model/spec-complete-response";
import { SpecResponseToTestSuiteInfoMapper } from "../test-explorer/spec-response-to-test-suite-info.mapper";

const SKIP_ALL_TESTS_PATTERN = "$#%#";

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
    private readonly logger: Logger
  ) {}

  // public async loadTests(pathFinder: PathFinder, karmaPort: number): Promise<TestSuiteInfo> {
  //   // FIXME: Should create new listener for each test load which can also then used to run the tests

  //   const karmaRunConfig = this.createKarmaRunConfig(SKIP_ALL_TESTS_PATTERN, karmaPort);
  //   this.karmaEventListener.lastRunTest = "root";

  //   await this.callKarma(karmaRunConfig);
  //   return this.karmaEventListener.getLoadedTests(pathFinder);
  // }

  public async loadTests(pathFinder: PathFinder, karmaPort: number): Promise<TestSuiteInfo> {
    const testLoadExecution = {} as { start: PromiseExecutor<void>, stop: PromiseExecutor<void> };

    const testLoad: Execution = {
      onStart: new Promise((resolve, reject) => testLoadExecution.start = { resolve, reject }),
      onStop: new Promise((resolve, reject) => testLoadExecution.stop = { resolve, reject })
    };

    const futureLoadedSpecs = this.karmaEventListener.listenForAllSpecs(testLoad);
    const karmaRunConfig = this.createKarmaRunConfig(SKIP_ALL_TESTS_PATTERN, karmaPort);

    testLoadExecution.start.resolve();
    await this.callKarmaRun(karmaRunConfig);
    testLoadExecution.stop.resolve();

    const capturedSpecs: SpecCompleteResponse[] = await futureLoadedSpecs;
    const specToTestSuiteMapper = new SpecResponseToTestSuiteInfoMapper(pathFinder);
    return specToTestSuiteMapper.map(capturedSpecs);
  }

  private resolveTests(tests: Array<TestInfo | TestSuiteInfo>): Array<TestInfo | TestSuiteInfo> {
    // FIXME: Implement
    // - Reduce test collection to non-overlapping set before processing
    // - A collection which includes the root suite should return empty test[] array

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

  public async runTests(tests: Array<TestInfo | TestSuiteInfo>, karmaPort: number): Promise<void> {
    let testNames: string[] = tests.map(test => test.fullName);
    this.logger.info(`Requested tests to run: ${JSON.stringify(testNames)}`, { divider: "Karma Logs" });  // FIXME: what's divider?

    const runAllTests = tests.length === 0;
    let aggregateTestPattern: string = SKIP_ALL_TESTS_PATTERN;

    if (runAllTests) {
      testNames = [];
      aggregateTestPattern = "";
      this.logger.debug(`Received empty test list - Will run all tests`);

    } else {
      const resolvedTestSet = this.resolveTests(tests);
      testNames = resolvedTestSet.map(test => test.fullName);
      this.logger.debug(`Resolved tests to run: ${JSON.stringify(testNames)}`);
  
      const testPatterns: string[] = resolvedTestSet.filter(test => !!test.fullName).map(test => {
        let testPattern: string = `^${this.escapeForRegExp(test.fullName)}`;
        if (test.type === "test") {
          testPattern = `${testPattern}$`;
        }
        return testPattern;
      });
      aggregateTestPattern = `/(${testPatterns.join("|")})/`;
    }

    const karmaRunConfig = this.createKarmaRunConfig(aggregateTestPattern, karmaPort);
    const testRunExecution = {} as { start: PromiseExecutor<void>, stop: PromiseExecutor<void> };

    const testRun: Execution = {
      onStart: new Promise((resolve, reject) => testRunExecution.start = { resolve, reject }),
      onStop: new Promise((resolve, reject) => testRunExecution.stop = { resolve, reject })
    };

    this.karmaEventListener.listenForSpecs(testNames, testRun);

    testRunExecution.start.resolve();
    await this.callKarmaRun(karmaRunConfig);
    testRunExecution.stop.resolve();
  }

  // public async runTests(tests: Array<TestInfo | TestSuiteInfo>, karmaPort: number): Promise<void> {
  //   // FIXME: Reduce test collection to non-overlapping set before processing

  //   this.karmaEventListener.listenForTests(tests);

  //   const testPatterns = tests.map(test => {
  //     if (!test.fullName) {
  //       return "";
  //     }
  //     let testPattern: string = `^${this.escapeForRegExp(test.fullName)}`;
  //     if (test.type === "test") {
  //       testPattern = `${testPattern}$`;
  //     }
  //     return testPattern;
  //   });

  //   const aggregateTestPattern = `/(${testPatterns.join("|")})/`;
  //   const karmaRunConfig = this.createKarmaRunConfig(aggregateTestPattern, karmaPort);
  //   const testNames = tests.filter(test => !!test.fullName).map(test => test.fullName) as string[];

  //   this.logger.info(`Running tests: ${JSON.stringify(testNames)}`, { divider: "Karma Logs" });  // FIXME: what's divider?
  //   await this.callKarma(karmaRunConfig);
  //   this.karmaEventListener.isTestRunning = false;
  // }

  // public async runTests(tests: Array<TestInfo | TestSuiteInfo>, karmaPort: number): Promise<void> {
  //   this.karmaEventListener.isTestRunning = true;
  //   tests.forEach(async (test) => await this.runTest(test, karmaPort));
  //   this.karmaEventListener.isTestRunning = false;

  //   this.karmaEventListener.lastRunTest = testFullName;
  //   this.karmaEventListener.isComponentRun = isComponentRun;
  //   const isComponentRun = test.type === TestType.Suite;
  // }

  // private async runTest(test: TestInfo | TestSuiteInfo, karmaPort: number): Promise<void> {
  //   if (!test.fullName) {
  //     return;
  //   }
  //   let testFullName = test.fullName;
  //   this.logger.info(`Running test: ${testFullName}`, { divider: "Karma Logs" });  // FIXME: what's divider?
    
  //   if (testFullName === "root") {  // FIXME: Define shared constant for string name 'root' used as name of all tests root node
  //     testFullName = "";
  //   }
  //   const testPattern = `/^${this.escapeForRegExp(testFullName)}/`;
  //   const karmaRunConfig = this.createKarmaRunConfig(testPattern, karmaPort);
  //   await this.callKarma(karmaRunConfig);
  // }

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

  /*
  public isTestsRunning(): boolean {
    return this.karmaEventListener.isTestRunning;
  }

  public async stopRun() {
    return new Promise<void>(resolve => {
      const stopper = require("karma").stopper;
      stopper.stop({ port: this.karmaPort }, (exitCode: any) => {
        resolve();
      });
    });
  }
  */
}