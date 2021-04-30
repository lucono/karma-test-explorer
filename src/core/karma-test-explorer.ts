import { TestRunner } from "./karma/test-runner";
import { KarmaEventListener } from "./integration/karma-event-listener";
import { Logger } from "./helpers/logger";
import { TestSuiteInfo } from "vscode-test-adapter-api";
import { TestExplorerConfiguration } from "../model/test-explorer-configuration";
import { KarmaServer, KarmaServerExecution } from "./karma/karma-server";
import { PathFinder } from './helpers/path-finder';
import { TestResult } from "../model/enums/test-status.enum";
import { getPort as getAvailablePort, getPortPromise as getAvailablePortPromise } from "portfinder";

export class KarmaTestExplorer {
  public constructor(
    private readonly karmaServer: KarmaServer,
    private readonly testRunner: TestRunner,
    private readonly karmaEventListener: KarmaEventListener,
    private readonly logger: Logger
  ) { }

  public async loadTests(config: TestExplorerConfiguration, pathFinder: PathFinder): Promise<TestSuiteInfo> {
    try {
      this.karmaEventListener.stopListening();

      if (this.karmaServer.isRunning()) {
        await this.karmaServer.kill();
      }
      
      const serverKarmaPort = await getAvailablePortPromise({ port: config.karmaPort });
      const minKarmerListenerSocketPort = Math.max(config.defaultSocketConnectionPort, serverKarmaPort + 1);

      const karmerListenerSocketPort = await new Promise<number>(resolve => {
        getAvailablePort(
          { port: minKarmerListenerSocketPort }, 
          (err: Error, port: number) => resolve(port));
      });

      this.logger.info(`Using available karma port: ${config.karmaPort} --> ${serverKarmaPort}`);
      this.logger.info(`Using available karma listener socket port: ${config.defaultSocketConnectionPort} --> ${karmerListenerSocketPort}`);

      const karmaServerExecution: KarmaServerExecution = await this.karmaServer.start(config, serverKarmaPort, {
        karmaSocketPort: `${karmerListenerSocketPort}`
      });

      try {
        await new Promise<void>((resolve, reject) => {
          this.karmaEventListener.listenForNewConnection(karmerListenerSocketPort)
            .then(() => resolve())
            .catch((failureReason) => reject(`${failureReason}`));
          
            karmaServerExecution.futureExit.then(() => reject(`Karma server quit prematurely`));
        });

      } catch (error) {
        this.logger.error(`Failed to load tests: ${error}`);
        this.karmaEventListener.stopListening();
        throw error;
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
      const failureMessage = `Test loading failed: ${error.message ?? error}`;
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
