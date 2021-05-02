// import { TestExplorerConfiguration } from "../../model/test-explorer-configuration";
import { Logger } from "../helpers/logger";
import { KarmaEventListener } from "../integration/karma-event-listener";
import { TestSuiteInfo } from "vscode-test-adapter-api";
import { PathFinder } from "../helpers/path-finder";
import { TestRunner } from "./test-runner";
import { request as httpRequest } from "http";

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

  public async loadTests(pathFinder: PathFinder, karmaPort: number): Promise<TestSuiteInfo> {
    // FIXME: Should create new listener for each test load which can also then used to run the tests

    const karmaRunConfig = this.createKarmaRunConfig(SKIP_ALL_TESTS_PATTERN, karmaPort);
    this.karmaEventListener.lastRunTest = "root";

    await this.callKarma(karmaRunConfig);
    return this.karmaEventListener.getLoadedTests(pathFinder);
  }

  public async runTests(tests: string[], isComponentRun: boolean, karmaPort: number): Promise<void> {
    tests.forEach(async (testName) => await this.runTest(testName, isComponentRun, karmaPort));
  }

  private async runTest(testName: string = "root", isComponentRun: boolean, karmaPort: number): Promise<void> {
    this.logger.info(
      `Running test: ${testName}`,
      { divider: "Karma Logs" }  // FIXME: what's this?
    );

    // FIXME: Define shared constant for string name 'root' used as name of all tests root node
    if (testName === "root") {
      testName = "";
    }
    const testPattern = `/^${this.escapeForRegExp(testName)}/`;
    const karmaRunConfig = this.createKarmaRunConfig(testPattern, karmaPort);

    this.karmaEventListener.isTestRunning = true;
    this.karmaEventListener.lastRunTest = testName;
    this.karmaEventListener.isComponentRun = isComponentRun;
    await this.callKarma(karmaRunConfig);
    this.karmaEventListener.isTestRunning = false;
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

  private async callKarma(config: KarmaRunConfig): Promise<void> {
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

  private escapeForRegExp(stringValue: string = "") {
    // From MDN: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#escaping
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