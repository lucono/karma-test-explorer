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
          .catch(failureReason => reject(`${failureReason}`));
        
          karmaServerExecution.stopped.then(() => reject(`Karma server quit prematurely`));
      });
    } catch (error) {
      this.logger.error(`Failed to load tests: ${error}`);
      this.stopCurrentRun();
      throw error;
    }
  }

  public async loadTests(config: TestExplorerConfiguration, pathFinder: PathFinder): Promise<TestSuiteInfo> {
    try {
      if (!this.isSystemsRunning()) {
        this.logger.info(`Request to load tests - ` +
        `karma server is ${!this.karmaServer.isRunning() ? 'not' : ''} running, and ` +
        `karma listener is ${!this.karmaEventListener.isRunning() ? 'not' : ''} running - ` +
        `Restarting both`);

        await this.restart(config);
      }
      
      this.logger.info("Proceeding to load tests");

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

  public async runTests(config: TestExplorerConfiguration, tests: Array<TestInfo | TestSuiteInfo>): Promise<void> {
    try {
      if (!this.isSystemsRunning()) {
        this.logger.info(`Request to run tests - ` +
        `karma server is ${!this.karmaServer.isRunning() ? 'not' : ''} running, and ` +
        `karma listener is ${!this.karmaEventListener.isRunning() ? 'not' : ''} running - ` +
        `Restarting both`);

        await this.restart(config);
      }
      
      this.logger.info("Proceeding to run tests");

      this.testRunning = true;
      const karmaPort = this.karmaServer.getServerPort() as number;
      await this.testRunner.runTests(tests, karmaPort);
    } finally {
      this.testRunning = false;
    }
  }

  public async stopCurrentRun(): Promise<void> {
    if (this.karmaEventListener.isRunning()) {
      this.karmaEventListener.stop();
    }

    if (this.karmaServer.isRunning()) {
      // FIXME: Should this use stop() instead of kill()?
      // Which one best guarantees termination of both karma
      // and its launched browser/s without leaving any orphans?
      await this.karmaServer.kill();
    }
  }

  public isTestRunning(): boolean {
    return this.testRunning;
  }

  private isSystemsRunning(): boolean {
    return this.karmaServer.isRunning() && this.karmaEventListener.isRunning();
  }

  public dispose(): void {
    if (this.karmaServer.isRunning()) {
      this.karmaServer.kill();
    }
  }
}
