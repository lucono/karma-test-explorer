import { TestExplorerConfiguration } from "../../model/test-explorer-configuration";
import { Logger } from "../helpers/logger";
import { KarmaEventListener } from "../integration/karma-event-listener";
import { TestSuiteInfo } from "vscode-test-adapter-api";
import { SpawnOptions } from "child_process";
import { PathFinder } from "../helpers/path-finder";
import { CommandlineProcessHandler } from "../integration/commandline-process-handler";

const SKIP_ALL_TESTS_PATTERN = "$#%#";

export class KarmaCliTestRunner {

  public constructor(
    private readonly testRunnerProcessHandler: CommandlineProcessHandler,
    private readonly karmaEventListener: KarmaEventListener,
    private readonly logger: Logger
  ) {}

  public async loadTests(config: TestExplorerConfiguration, pathFinder: PathFinder): Promise<TestSuiteInfo> {
    await this.callKarma([SKIP_ALL_TESTS_PATTERN], config, true);
    return this.karmaEventListener.getLoadedTests(pathFinder);
  }

  public async runTests(tests: string[], config: TestExplorerConfiguration, isComponentRun: boolean): Promise<void> {
    return this.callKarma(tests, config, isComponentRun);
  }

  public isTestCurrentlyRunning(): boolean {
    return this.testRunnerProcessHandler.isProcessRunning();
  }

  public async stopCurrentRun() {
    await this.testRunnerProcessHandler.kill();
  }

  private async callKarma(tests: string[], config: TestExplorerConfiguration, isComponentRun: boolean): Promise<void> {
    this.log(tests);

    const isRootComponent = tests[0] === SKIP_ALL_TESTS_PATTERN;
    const isAllTestRun = tests[0] === "root" || tests[0] === undefined;

    if (isAllTestRun) {
      tests = [""];
    }
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
      `--port=${config.karmaPort}`,
      "--",
      "--grep", testsArg
    ];

    // this.karmaEventListener.isTestRunning = true;
    this.karmaEventListener.lastRunTests = isRootComponent ? "root" : testsString;
    this.karmaEventListener.isComponentRun = isComponentRun;

    return this.testRunnerProcessHandler.run(command, processArguments, options);
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
