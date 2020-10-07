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
    if (this.testRunner.isServerRunning()) {
      await this.karmaServer.stopAsync();
    }

    await this.karmaServer.start(config);
    const testSuiteInfo = await this.testRunner.loadTests(config, pathFinder);

    if (testSuiteInfo.children.length === 0) {
      this.logger.info("Test loading completed - No tests found");
    } else {
      this.logger.info("Test loading completed");
    }

    return testSuiteInfo;
  }

  public async runTests(config: TestExplorerConfiguration, tests: string[], isComponentRun: boolean): Promise<void> {
    await this.testRunner.runTests(tests, config, isComponentRun);
    this.logger.status(this.karmaEventListener.testStatus as TestResult);
  }

  public async stopCurrentRun(): Promise<void> {
    if (this.testRunner.isServerRunning()) {
      await this.karmaServer.stopAsync();
    }
  }

  public dispose(): void {
    if (this.testRunner.isServerRunning()) {
      this.karmaServer.stop();
    }
  }
}
