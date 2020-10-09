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
  ) {}

  public async loadTests(config: TestExplorerConfiguration, pathFinder: PathFinder): Promise<TestSuiteInfo> {
    this.karmaServer.restart(config);
    await this.karmaEventListener.receiveBrowserConnection(config.defaultSocketConnectionPort);

    const testSuiteInfo = await this.testRunner.loadTests(config, pathFinder);
    return testSuiteInfo;

    /*
    try {
      await this.karmaServer.restart(config);
      const testSuiteInfo = await this.testRunner.loadTests(config, pathFinder);

      return testSuiteInfo;
    } catch(error) {
      throw new Error(`Test loading failed: ${error.message || error}`)
    }
    */
  }

  public async runTests(config: TestExplorerConfiguration, tests: string[], isComponentRun: boolean): Promise<void> {
    if (!this.karmaEventListener.isBrowserConnected()) {
      this.logger.warn(`Request to run tests: Cannot proceed - Browser is not connected`);
      return;
    }

    if (this.testRunner.isTestCurrentlyRunning()) {
      this.logger.info("Request to run tests: Cannot proceed - Another test is currently running");
      return;
    }

    await this.testRunner.runTests(tests, config, isComponentRun);
    this.logger.status(this.karmaEventListener.testStatus as TestResult);
  }

  public async stopCurrentRun(): Promise<void> {
    if (!this.testRunner.isTestCurrentlyRunning()) {
      this.logger.info("No test currently running");
      return;
    }
    await this.testRunner.stopCurrentRun();
    this.logger.info("Stopped current test run");
  }

  public dispose(): void {
    if (this.testRunner.isTestCurrentlyRunning()) {
      this.testRunner.stopCurrentRun();
    }
    if (this.karmaServer.isServerRunning()) {
      this.karmaServer.stop();
    }
  }
}
