// import { TestExplorerConfiguration } from "../../model/test-explorer-configuration";
import { Logger } from "../helpers/logger";
import { KarmaEventListener } from "../integration/karma-event-listener";
import { TestFileSuiteInfo, TestFolderSuiteInfo, TestInfo, TestSuiteInfo } from "vscode-test-adapter-api";
import { TestRunner } from "./test-runner";
import { Execution, PromiseExecutor } from "../helpers/execution";
import { SpecCompleteResponse } from "../../model/spec-complete-response";
import { SpecResponseToTestSuiteInfoMapper } from "../test-explorer/spec-response-to-test-suite-info-mapper";
import { TestSuiteType, TestType } from "../../model/enums/test-type.enum";
import { TestExplorerConfiguration } from "../../model/test-explorer-configuration";
import { SpawnOptions } from "child_process";
import { CommandlineProcessHandler } from "../integration/commandline-process-handler";

const SKIP_ALL_TESTS_PATTERN = "$#%#";
const RUN_ALL_TESTS_PATTERN = "";

interface KarmaRunConfig {
  port: number;
  refresh: boolean;
  urlRoot: string;
  hostname: string;
  clientArgs: string[];
};

export class CommandLineTestRunner implements TestRunner {
  public constructor(
    private readonly karmaEventListener: KarmaEventListener,  // FIXME: Should not receive but own its own listener
    private readonly specToTestSuiteMapper: SpecResponseToTestSuiteInfoMapper,
    private readonly logger: Logger
  ) {}

  public async loadTests(
    karmaPort: number,
    testExplorerConfig: TestExplorerConfiguration): Promise<TestSuiteInfo>
  {
    const testLoadExecution = {} as { start: PromiseExecutor<void>, stop: PromiseExecutor<void> };

    const testLoad: Execution = {
      started: new Promise((resolve, reject) => testLoadExecution.start = { resolve, reject }),
      stopped: new Promise((resolve, reject) => testLoadExecution.stop = { resolve, reject })
    };

    const futureLoadedSpecs = this.karmaEventListener.listenForTests(testLoad);
    const karmaRunConfig = this.createKarmaRunConfig(SKIP_ALL_TESTS_PATTERN, karmaPort);

    testLoadExecution.start.resolve();
    await this.callKarmaRun(karmaRunConfig, testExplorerConfig);
    testLoadExecution.stop.resolve();

    const capturedSpecs: SpecCompleteResponse[] = await futureLoadedSpecs;
    return this.specToTestSuiteMapper.map(capturedSpecs);
  }

  public async runTests(
    tests: (TestInfo | TestSuiteInfo)[],
    karmaPort: number,
    testExplorerConfig: TestExplorerConfiguration): Promise<void>
  {
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
      const derivedRunnableTests: (TestInfo | TestSuiteInfo)[] = this.toRunnableTests(tests);
      testList = this.removeTestOverlaps(derivedRunnableTests);
      this.logger.debug(() => `Resolved tests to run: ${JSON.stringify(testList.map(test => test.fullName))}`);
  
      const testPatterns: string[] = testList
        .filter(test => !!test.fullName)  // FIXME: These will be files and folders - expand to suites and add to tests
        .map(test => `^${this.escapeForRegExp(test.fullName)}${test.type === TestType.Suite ? ' ' : '$'}`);

      if (testPatterns.length === 0) {
        throw new Error(`No tests to run`);
      }
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
    await this.callKarmaRun(karmaRunConfig, testExplorerConfig);
    testRunExecution.stop.resolve();
  }

  private toRunnableTests(tests: (TestInfo | TestSuiteInfo | TestFileSuiteInfo | TestFolderSuiteInfo)[]): (TestInfo | TestSuiteInfo)[] {
    const runnableTests: (TestInfo | TestSuiteInfo)[] = [];

    tests.forEach(test => {
      if (test.fullName) {
        runnableTests.push(test);
        return;
      }
      if (test.type !== TestType.Suite || !('suiteType' in test)) {
        return;
      }
      if (test.suiteType === TestSuiteType.File) {
        runnableTests.push(...test.children);
        return;
      }
      if (test.suiteType === TestSuiteType.Folder) {
        runnableTests.push(...this.toRunnableTests(test.children));
        return;
      }
    });
    return runnableTests;
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
      refresh: false,
      urlRoot: "/run",
      hostname: "localhost",
      clientArgs: [`--grep=${testPattern}`],
    };
  }

  private async callKarmaRun(karmaRunConfig: KarmaRunConfig, explorerConfig: TestExplorerConfiguration): Promise<void> {
    // const isRootComponent = tests[0] === SKIP_ALL_TESTS_PATTERN;
    // const isAllTestRun = tests[0] === "root" || tests[0] === undefined;

    // if (isAllTestRun) {
    //   tests = [""];
    // }
    const baseKarmaConfigFilePath = require.resolve(explorerConfig.baseKarmaConfFilePath);

    const environment = {
      ...process.env,
      ...explorerConfig.envFileEnvironment,
      ...explorerConfig.env,
      karmaSocketPort: `${explorerConfig.defaultSocketConnectionPort}`,
      userKarmaConfigPath: explorerConfig.userKarmaConfFilePath,
      karmaPort: `${karmaRunConfig.port}`
    };

    const spawnOptions: SpawnOptions = {
      cwd: explorerConfig.projectRootPath,
      shell: true,
      env: environment
    };

    let command = "npx";
    let processArguments = [ "karma" ];

    if (explorerConfig.karmaProcessExecutable) {
      command = explorerConfig.karmaProcessExecutable;
      processArguments = [];
    }

    // const testsString = tests[0];
    // const testsArg = testsString.replace(/[\W ]/g, "\\$&");

    const clientArgs = karmaRunConfig.clientArgs.map(arg => arg.replace(/[\W ]/g, "\\$&"));

    processArguments = [
      ...processArguments,
      "run",
      baseKarmaConfigFilePath,
      `--port=${karmaRunConfig.port}`,
      "--",
      ...clientArgs
    ];

    // this.karmaEventListener.isTestRunning = true;
    // this.karmaEventListener.lastRunTests = isRootComponent ? "root" : testsString;
    // this.karmaEventListener.isComponentRun = isComponentRun;

    const runTestsProcessHandler = new CommandlineProcessHandler(this.logger, command, processArguments, spawnOptions);
    return runTestsProcessHandler.futureExit();
  }

  private escapeForRegExp(stringValue: string) {
    // Taken from MDN: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#escaping
    return stringValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}