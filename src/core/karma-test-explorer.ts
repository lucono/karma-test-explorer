import { TestRunner } from "./karma/test-runner";
import { KarmaEventListener } from "./integration/karma-event-listener";
import { Logger } from "./helpers/logger";
import { TestSuiteInfo } from "vscode-test-adapter-api";
import { TestExplorerConfiguration } from "../model/test-explorer-configuration";
import { KarmaServer } from "./karma/karma-server";
import { PathFinder } from './helpers/path-finder';
import { TestResult } from "../model/enums/test-status.enum";

export class KarmaTestExplorer {
  public constructor(
    private readonly karmaServer: KarmaServer,
    private readonly testRunner: TestRunner,
    private readonly karmaEventListener: KarmaEventListener,
    private readonly logger: Logger
  ) { }

  public async loadTests(config: TestExplorerConfiguration, pathFinder: PathFinder): Promise<TestSuiteInfo> {
    try {
      // if (this.karmaServer.isServerRunning()) {
        await this.karmaServer.stop();
      // }

      await this.karmaServer.start(config);
      const testSuiteInfo = await this.testRunner.loadTests(config, pathFinder);

      if (testSuiteInfo.children.length === 0) {
        this.logger.info("Test loading - No tests found");
      } else {
        this.logger.info("Test loading - Tests found");
      }

      return testSuiteInfo;
    } catch (error) {
      throw new Error(`Test loading failed: ${error.message || error}`)
    }
  }

  public async runTests(config: TestExplorerConfiguration, tests: string[], isComponentRun: boolean): Promise<void> {
    await this.testRunner.runTests(tests, config, isComponentRun);
    this.logger.status(this.karmaEventListener.testStatus as TestResult);
  }

  public async stopCurrentRun(): Promise<void> {
    // if (this.testRunner.isServerRunning()) {
    await this.karmaServer.stop();
    // }
  }

  public dispose(): void {
    // if (this.testRunner.isServerRunning()) {
    this.karmaServer.stop();
    // }
  }
}
