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
      if (this.karmaEventListener.isConnected()) {
        await this.karmaEventListener.disconnect();
      }

      const karmaServerStartupResult = await this.karmaServer.restart(config);
      const karmaSocketPort = karmaServerStartupResult.serverSocketPort;

      const futureKarmaServerExit = this.karmaServer.futureServerExit();
      const futureBrowserConnect = this.karmaEventListener.connect(karmaSocketPort);
      const futureBrowserConnectOrKarmaServerExit = Promise.race([futureBrowserConnect, futureKarmaServerExit]);

      try {
        await futureBrowserConnectOrKarmaServerExit;
      } catch (error) {
        const failureMessage = `Failed to start and connect to karma server: ${error.message || error}`;
        this.logger.error(failureMessage);
        throw new Error(failureMessage);
      }

      if (!this.karmaEventListener.isConnected()) {
        const failureMessage = `Failed to load tests - Server failed to connect`;
        this.logger.error(failureMessage);
        throw new Error(failureMessage);
      }

      const karmaPort = this.karmaServer.getServerPort() as number;
      const testSuiteInfo = await this.testRunner.loadTests(pathFinder, karmaPort);

      if (testSuiteInfo.children.length === 0) {
        this.logger.info("Test loading - No tests found");
      } else {
        this.logger.info("Test loading - Tests found");
      }

      return testSuiteInfo;
    } catch (error) {
      const failureMessage = `Test loading failed: ${error.message || error}`;
      this.logger.error(failureMessage);
      throw new Error(failureMessage);
    }
  }

  public async runTests(config: TestExplorerConfiguration, tests: string[], isComponentRun: boolean): Promise<void> {
    if (!this.karmaServer.isRunning()) {
      const failureMessage = `Failed to run tests - Karma server is not running`;
      this.logger.error(failureMessage);
      throw new Error(failureMessage);
    }

    const karmaPort = this.karmaServer.getServerPort() as number;
    await this.testRunner.runTests(tests, isComponentRun, karmaPort);
    this.logger.status(this.karmaEventListener.testStatus as TestResult);
  }

  public async stopCurrentRun(): Promise<void> {
    await this.karmaServer.stop();
  }

  public dispose(): void {
    this.karmaServer.stop();
  }
}
