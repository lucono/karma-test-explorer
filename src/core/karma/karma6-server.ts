import { KarmaEventListener } from "../integration/karma-event-listener";
import { Logger } from "../helpers/logger";
import { TestExplorerConfiguration } from "../../model/test-explorer-configuration";
import { config, Server, Config as KarmaConfig, stopper as karmaStopper } from "karma";

export class Karma6Server {
  private server?: Server;
  private karmaConfig?: KarmaConfig;

  public constructor(
    private readonly karmaEventListener: KarmaEventListener,
    private readonly logger: Logger
  ) {}

  public async start(testExplorerConfig: TestExplorerConfiguration): Promise<void> {
    await this.stop();
    this.logger.info(`Starting Karma server`);

    try {
      const karmaConfig = await config.parseConfig(
        testExplorerConfig.baseKarmaConfFilePath,
        { port: testExplorerConfig.karmaPort },
        { promiseConfig: true, throwErrors: true }
      );

      const futureServerExit = new Promise<void>((resolve) => {
        const serverInstance = new Server(karmaConfig, (exitCode) => {
          this.logger.info(`Karma has exited with exit code: ${exitCode}`);
          this.clearCurrentServer();
          resolve();
        });
        this.setCurrentServer(serverInstance, karmaConfig);
      });

      if (this.server === undefined) {
        throw new Error(`Failed to create karma server instance`);
      }
      await this.server.start();

      const futureBrowserConnect = this.karmaEventListener.listenTillBrowserConnected(testExplorerConfig.defaultSocketConnectionPort);
      const futureBrowserConnectOrServerExit = Promise.race([futureBrowserConnect, futureServerExit]);
      await futureBrowserConnectOrServerExit;
      
    } catch (error) {
      throw new Error(`Failed to start and connect to server: ${error.message || error}`);
    }
  }

  public async stop(): Promise<void> {
    this.logger.info(`Stopping Karma server`);
    
    if (this.server !== undefined || this.karmaConfig !== undefined) {
      karmaStopper.stop(this.karmaConfig, (exitCode) => {
        if (exitCode === 0) {
          this.logger.info(`Server stopped with exit code: ${exitCode}`);
        }
        this.clearCurrentServer();
      });
    } else {
      this.logger.info(`Karma Server is not running`);
    }
    this.karmaEventListener.stopListeningToKarma();
  }

  private setCurrentServer(karmaServer: Server, karmaConfig: KarmaConfig) {
    this.server = karmaServer;
    this.karmaConfig = karmaConfig;
  }

  private clearCurrentServer() {
    this.server = undefined;
    this.karmaConfig = undefined;
  }
}
