import { TestExplorerConfiguration } from "../../model/test-explorer-configuration";
import { Logger } from "../helpers/logger";
import { KarmaEventListener } from "../integration/karma-event-listener";
import { TestRunner } from "./test-runner";
import { TestSuiteInfo } from "vscode-test-adapter-api";
import { SpawnOptions } from "child_process";
import { PathFinder } from "../helpers/path-finder";
import { CommandlineProcessHandler } from "../integration/commandline-process-handler";

const SKIP_ALL_TESTS_PATTERN = "$#%#";

export class KarmaCliTestRunner implements TestRunner {

  public constructor(
    private readonly karmaEventListener: KarmaEventListener,
    private readonly karmaPort: number,
    private readonly logger: Logger
  ) {}

  public isServerRunning(): boolean {
    return this.karmaEventListener.isServerConnected;
  }

  public async loadTests(config: TestExplorerConfiguration, pathFinder: PathFinder): Promise<TestSuiteInfo> {
    await this.callKarma([SKIP_ALL_TESTS_PATTERN], config, true);
    return this.karmaEventListener.getLoadedTests(pathFinder);
  }

  public async runTests(tests: string[], config: TestExplorerConfiguration, isComponentRun: boolean): Promise<void> {
    return this.callKarma(tests, config, isComponentRun);
  }

  public async stopRun() {
    return new Promise<void>(resolve => {
      const stopper = require("karma").stopper;
      stopper.stop({ port: this.karmaPort }, (exitCode: any) => {
        resolve();
      });
    });
  }

  private async callKarma(tests: string[], config: TestExplorerConfiguration, isComponentRun: boolean): Promise<void> {
    this.log(tests);

    const isRootComponent = tests[0] === SKIP_ALL_TESTS_PATTERN;
    const isAllTestRun = tests[0] === "root" || tests[0] === undefined;

    if (isAllTestRun) {
      tests = [""];
    }
    const baseKarmaConfigFilePath = require.resolve(config.baseKarmaConfFilePath);

    const testExplorerEnvironment = {
      ...process.env,
      ...config.env,
      userKarmaConfigPath: config.userKarmaConfFilePath,
      defaultSocketPort: `${config.defaultSocketConnectionPort}`
    };

    const options = {
      cwd: config.projectRootPath,
      shell: true,
      env: testExplorerEnvironment,
    } as SpawnOptions;

    let command = "npx";
    let processArguments = [ "karma" ];

    if (config.karmaProcessExecutable) {
      command = config.karmaProcessExecutable;
      processArguments = [];
    }

    const testsString = tests[0];
    const testsArg = testsString.replace(/[\W ]/g, "\\$&");

    processArguments = [
      ...processArguments,
      "run",
      baseKarmaConfigFilePath,
      `--port=${config.karmaPort}`,
      "--",
      "--grep", testsArg
    ];

    this.karmaEventListener.isTestRunning = true;
    this.karmaEventListener.lastRunTests = isRootComponent ? "root" : testsString;
    this.karmaEventListener.isComponentRun = isComponentRun;

    const runTestsProcessHandler = new CommandlineProcessHandler(this.karmaEventListener, this.logger);
    await runTestsProcessHandler.create(command, processArguments, options);
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
