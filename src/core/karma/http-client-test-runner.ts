import { TestExplorerConfiguration } from "../../model/test-explorer-configuration";
import { Logger } from "../helpers/logger";
import { KarmaEventListener } from "../integration/karma-event-listener";
import { TestSuiteInfo } from "vscode-test-adapter-api";
import { PathFinder } from "../helpers/path-finder";
import { TestRunner } from "./test-runner";

const SKIP_ALL_TESTS_PATTERN = "$#%#";

export class HttpClientTestRunner implements TestRunner {
  public constructor(
    private readonly karmaEventListener: KarmaEventListener,
    private readonly karmaPort: number,
    private readonly logger: Logger
  ) {}

  public async loadTests(config: TestExplorerConfiguration, pathFinder: PathFinder): Promise<TestSuiteInfo> {
    const karmaRunParameters = this.createKarmaRunCallConfiguration(SKIP_ALL_TESTS_PATTERN);
    this.karmaEventListener.lastRunTests = "root";

    await this.callKarmaRunWithConfig(karmaRunParameters.config);
    return this.karmaEventListener.getLoadedTests(pathFinder);
  }

  public async runTests(tests: string[], config: TestExplorerConfiguration, isComponentRun: boolean): Promise<void> {
    this.log(tests);
    const karmaRunParameters = this.createKarmaRunCallConfiguration(tests);

    this.karmaEventListener.isTestRunning = true;
    this.karmaEventListener.lastRunTests = tests[0];
    this.karmaEventListener.isComponentRun = isComponentRun;
    await this.callKarmaRunWithConfig(karmaRunParameters.config);
    this.karmaEventListener.isTestRunning = false;
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

  private createKarmaRunCallConfiguration(tests: any) {
    // if testName is undefined, reset jasmine.getEnv().specFilter function
    // otherwise, last specified specFilter will be used
    if (tests[0] === "root" || tests[0] === undefined) {
      tests = "";
    }
    const urlRoot = "/run";
    const config = {
      port: this.karmaPort,
      refresh: true,
      urlRoot,
      hostname: "localhost",
      clientArgs: [] as string[],
    };
    config.clientArgs = [`--grep=${tests}`];
    return { config, tests };
  }

  private callKarmaRunWithConfig(config: any): Promise<void> {
    return new Promise<void>(resolve => {
      const options = {
        hostname: config.hostname,
        path: config.urlRoot,
        port: config.port,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      };

      const http = require("http");

      const request = http.request(options);

      request.on("error", (e: any) => {
        if (e.code === "ECONNREFUSED") {
          global.console.error("There is no server listening on port %d", options.port);
        }
      });

      request.end(
        JSON.stringify({
          args: config.clientArgs,
          removedFiles: config.removedFiles,
          changedFiles: config.changedFiles,
          addedFiles: config.addedFiles,
          refresh: config.refresh,
        })
      );

      request.on("close", () => {
        resolve();
      });
    });
  }

  private log(tests: string[]): void {
    // TODO: What's going on here?
    const [suite, ...description] = tests[0].split(" ");
    this.logger.info(
      `Running [ suite: ${suite}${description.length > 0 ? ", test: " + description.join(" ") : ""} ]`,
      { divider: "Karma Logs" }
    );
  }
}