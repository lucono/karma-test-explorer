import { KarmaHttpClient } from "../integration/karma-http-client";
import { TestExplorerConfiguration } from "../../model/test-explorer-configuration";
import { Logger } from "../helpers/logger";
import { KarmaEventListener } from "../integration/karma-event-listener";
import { TestSuiteInfo } from "vscode-test-adapter-api";
import { SpawnOptions } from "child_process";
import { PathFinder } from "../helpers/path-finder";
import { CommandlineProcessHandler } from "../integration/commandline-process-handler";

export class KarmaRunner {
  public constructor(
    private readonly karmaHttpCaller: KarmaHttpClient,
    private readonly karmaEventListener: KarmaEventListener,
    private readonly karmaPort: number,
    private readonly logger: Logger
  ) {}

  public isKarmaRunning(): boolean {
    return this.karmaEventListener.isServerLoaded;
  }

  public async loadTests(projectRootPath: string, pathFinder: PathFinder): Promise<TestSuiteInfo> {
    const fakeTestPatternForSkippingEverything = "$#%#";
    const karmaRunParameters = this.karmaHttpCaller.createKarmaRunCallConfiguration(fakeTestPatternForSkippingEverything);
    this.karmaEventListener.lastRunTests = "root";

    await this.karmaHttpCaller.callKarmaRunWithConfig(karmaRunParameters.config);
    return this.karmaEventListener.getLoadedTests(projectRootPath, pathFinder);
  }

  /*
  public async runTests(tests: string[], isComponentRun: boolean): Promise<void> {
    this.log(tests);

    const karmaRunParameters = this.karmaHttpCaller.createKarmaRunCallConfiguration(tests);

    this.karmaEventListener.isTestRunning = true;
    this.karmaEventListener.lastRunTests = karmaRunParameters.tests;
    this.karmaEventListener.isComponentRun = isComponentRun;
    await this.karmaHttpCaller.callKarmaRunWithConfig(karmaRunParameters.config);
  }
  */

  public async runTests(config: TestExplorerConfiguration, tests: string[], isComponentRun: boolean): Promise<string> {
    this.log(tests);

    if (tests[0] === "root" || tests[0] === undefined) {
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

    const testsString = `${tests.join(",")}`;
    const testsArg = testsString.replace("'", "\\'");

    processArguments = [
      ...processArguments,
      "run",
      baseKarmaConfigFilePath,
      `--port=${config.karmaPort}`,
      "--",
      `--grep='${testsArg}'`
    ];

    this.karmaEventListener.isTestRunning = true;
    this.karmaEventListener.lastRunTests = testsString;
    this.karmaEventListener.isComponentRun = isComponentRun;

    const runTestsProcessHandler = new CommandlineProcessHandler(this.karmaEventListener, this.logger);
    runTestsProcessHandler.create(command, processArguments, options);
    await this.karmaEventListener.listenTillKarmaReady(config.defaultSocketConnectionPort);

    return config.projectRootPath;
  }

  public async stopRun() {
    return new Promise<void>(resolve => {
      const stopper = require("karma").stopper;
      stopper.stop({ port: this.karmaPort }, (exitCode: any) => {
        resolve();
      });
    });
  }

  private log(tests: string[]): void {
    const [suit, ...description] = tests[0].split(" ");
    this.logger.info(`Running [ suite: ${suit}${description.length > 0 ? ", test: " + description.join(" ") : ""} ]`, {
      addDividerForKarmaLogs: true,
    });
  }
}
