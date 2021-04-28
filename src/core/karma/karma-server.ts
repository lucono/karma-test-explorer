import { CommandlineProcessHandler } from "../integration/commandline-process-handler";
import { KarmaEventListener } from "../integration/karma-event-listener";
import { Logger } from "../helpers/logger";
import { TestExplorerConfiguration } from "../../model/test-explorer-configuration";
import { SpawnOptions } from "child_process";

export class KarmaServer {
  public constructor(
    private readonly karmaServerProcessHandler: CommandlineProcessHandler,
    private readonly karmaEventListener: KarmaEventListener,
    private readonly karmaPort: number,
    private readonly logger: Logger
  ) {}

  public async start(config: TestExplorerConfiguration): Promise<void> {
    const baseKarmaConfigFilePath = require.resolve(config.baseKarmaConfFilePath);

    const testExplorerEnvironment = {
      ...process.env,
      ...config.env,
      userKarmaConfigPath: config.userKarmaConfFilePath,
      karmaPort: `${config.karmaPort}`,
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

    processArguments = [
      ...processArguments,
      "start",
      baseKarmaConfigFilePath,
      `--port=${config.karmaPort}`
    ];

    const futureServerExit = this.karmaServerProcessHandler.create(command, processArguments, options);
    const futureBrowserConnect = this.karmaEventListener.listenTillBrowserConnected(config.defaultSocketConnectionPort);
    const futureBrowserConnectOrServerExit = Promise.race([futureBrowserConnect, futureServerExit]);

    try {
      await futureBrowserConnectOrServerExit;
    } catch (error) {
      throw new Error(`Server quit unexpectedly: ${error.message || error}`);
    }
  }

  public stop(): void {
    this.logger.info(`Stopping Karma server`);
    if (this.karmaServerProcessHandler.isProcessRunning()) {
      this.karmaServerProcessHandler.kill();
      this.logger.info(`Stopped Karma server`);
    } else {
      this.logger.info(`Karma server is not running`);
    }
    this.karmaEventListener.stopListeningToKarma();
    /*
    if (this.karmaEventListener.isServerLoaded) {
      const stopper = require("karma").stopper;
      stopper.stop({ port: this.karmaPort }, (exitCode: number) => {
        this.logger.info(`Karma exited succesfully`);
      });
      this.karmaEventListener.stopListeningToKarma();
    }
    */
  }

  public async stopAsync(): Promise<void> {
    return new Promise<void>(resolve => {
      if (this.karmaEventListener.isServerConnected) {
        const stopper = require("karma").stopper;
        stopper.stop({ port: this.karmaPort }, (exitCode: number) => {
          this.logger.info(`Karma exited succesfully`);
          resolve();
          this.karmaEventListener.stopListeningToKarma();
        });
      }
    });
  }
}
