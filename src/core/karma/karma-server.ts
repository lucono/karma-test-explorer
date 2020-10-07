import { CommandlineProcessHandler } from "../integration/commandline-process-handler";
import { KarmaEventListener } from "../integration/karma-event-listener";
import { Logger } from "../helpers/logger";
import { TestExplorerConfiguration } from "../../model/test-explorer-configuration";
import { SpawnOptions } from "child_process";

export class KarmaServer {
  public constructor(
    private readonly processHandler: CommandlineProcessHandler,
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

    this.processHandler.create(command, processArguments, options);
    await this.karmaEventListener.listenTillKarmaReady(config.defaultSocketConnectionPort);
  }

  public stop(): void {
    if (this.processHandler.isProcessRunning()) {
      this.processHandler.kill();
      this.logger.info(`Stopped Karma`);
    } else {
      this.logger.info(`Karma is not running`);
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
