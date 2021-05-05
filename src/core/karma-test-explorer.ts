import { TestRunner } from "./karma/test-runner";
import { KarmaEventListener } from "./integration/karma-event-listener";
import { Logger } from "./helpers/logger";
import { TestInfo, TestSuiteInfo } from "vscode-test-adapter-api";
import { TestExplorerConfiguration } from "../model/test-explorer-configuration";
import { KarmaServer } from "./karma/karma-server";
import { PathFinder } from './helpers/path-finder';
// import { TestResult } from "../model/enums/test-status.enum";
import { getPort as getAvailablePort, getPortPromise as getAvailablePortPromise } from "portfinder";
import { Execution } from "./helpers/execution";

export class KarmaTestExplorer {
  private testRunning: boolean = false;

  public constructor(
    private readonly karmaServer: KarmaServer,
    private readonly testRunner: TestRunner,
    private readonly karmaEventListener: KarmaEventListener,
    private readonly logger: Logger
  ) { }

  public async restart(config: TestExplorerConfiguration): Promise<void> {
    try {
      this.stopCurrentRun();

      const serverKarmaPort = await getAvailablePortPromise({ port: config.karmaPort });
      const minKarmerListenerSocketPort = Math.max(config.defaultSocketConnectionPort, serverKarmaPort + 1);

      const karmerListenerSocketPort = await new Promise<number>(resolve => {
        getAvailablePort(
          { port: minKarmerListenerSocketPort }, 
          (err: Error, port: number) => resolve(port));
      });

      this.logger.info(`Using available karma port: ${config.karmaPort} --> ${serverKarmaPort}`);
      this.logger.info(`Using available karma listener socket port: ${config.defaultSocketConnectionPort} --> ${karmerListenerSocketPort}`);

      const karmaServerExecution: Execution = await this.karmaServer.start(config, serverKarmaPort, {
        karmaSocketPort: `${karmerListenerSocketPort}`
      });

      await new Promise<void>((resolve, reject) => {
        this.karmaEventListener.acceptKarmaConnection(karmerListenerSocketPort)
          .then(() => resolve())
          .catch((failureReason) => reject(`${failureReason}`));
        
          karmaServerExecution.onStop.then(() => reject(`Karma server quit prematurely`));
      });
    } catch (error) {
      this.logger.error(`Failed to load tests: ${error}`);
      this.karmaEventListener.closeKarmaConnection();
      throw error;
    }
  }

  public async loadTests(pathFinder: PathFinder): Promise<TestSuiteInfo> {
    try {
      const karmaPort = this.karmaServer.getServerPort() as number;
      const testSuiteInfo = await this.testRunner.loadTests(pathFinder, karmaPort);

      if (testSuiteInfo.children.length === 0) {
        this.logger.info("Test loading - No tests found");
      } else {
        this.logger.info("Test loading - Tests found");
      }

      return testSuiteInfo;
      
    } catch (error) {
      const failureMessage = `Test loading failed: ${error.message ?? error}`;
      this.logger.error(failureMessage);
      throw new Error(failureMessage);
    }
  }

  public async runTests(tests: Array<TestInfo | TestSuiteInfo>): Promise<void> {
    if (!this.karmaServer.isRunning()) {
      const failureMessage = `Cannot run tests - Karma server is not running`;
      this.logger.error(failureMessage);
      throw new Error(failureMessage);
    }

    try {
      this.testRunning = true;
      const karmaPort = this.karmaServer.getServerPort() as number;
      await this.testRunner.runTests(tests, karmaPort);
      // this.logger.status(this.karmaEventListener.testStatus as TestResult);
    } finally {
      this.testRunning = false;
    }
  }

  public isTestRunning(): boolean {
    return this.testRunning;
  }

  public async stopCurrentRun(): Promise<void> {
    this.karmaEventListener.closeKarmaConnection();

    if (this.karmaServer.isRunning()) {
      // FIXME: Should this use stop() instead of kill()?
      // Which one best guarantees termination of both karma
      // and its launched browser/s without leaving any orphans?
      await this.karmaServer.kill();
    }
  }

  public dispose(): void {
    this.karmaServer.kill();
  }
}
