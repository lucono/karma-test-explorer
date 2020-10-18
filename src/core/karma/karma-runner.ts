import { KarmaHttpClient } from "../integration/karma-http-client";
import { Logger } from "../helpers/logger";
import { KarmaEventListener } from "../integration/karma-event-listener";
import { TestSuiteInfo } from "vscode-test-adapter-api";
import { PathFinder } from "../helpers/path-finder";

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

  public async runTests(tests: string[], isComponentRun: boolean): Promise<void> {
    this.log(tests);

    const karmaRunParameters = this.karmaHttpCaller.createKarmaRunCallConfiguration(tests);

    this.karmaEventListener.isTestRunning = true;
    this.karmaEventListener.lastRunTests = karmaRunParameters.tests;
    this.karmaEventListener.isComponentRun = isComponentRun;
    await this.karmaHttpCaller.callKarmaRunWithConfig(karmaRunParameters.config);
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
