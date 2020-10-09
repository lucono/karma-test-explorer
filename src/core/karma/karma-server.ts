import { CommandlineProcessHandler, CommandlineProcessHandlerRunOptions } from "../integration/commandline-process-handler";
import { Logger } from "../helpers/logger";
import { TestExplorerConfiguration } from "../../model/test-explorer-configuration";

export interface KarmaServerOptions {
  serverCrashHandler?: () => void
}

export class KarmaServer {
  public constructor(
    private readonly karmaServerProcessHandler: CommandlineProcessHandler,
    private readonly logger: Logger,
    private readonly serverOptions?: KarmaServerOptions
  ) {}

  public async start(config: TestExplorerConfiguration): Promise<void> {
    this.logger.info(`Starting Karma server`);

    if (this.isServerRunning()) {
      this.logger.info(`Karma server is already running`);
      return;
    }
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
      autoRestart: false,
      processCrashHandler: this.serverOptions?.serverCrashHandler
    } as CommandlineProcessHandlerRunOptions;

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

    this.karmaServerProcessHandler.run(command, processArguments, options);
    // const futureBrowserConnect = this.karmaEventListener.receiveBrowserConnection(config.defaultSocketConnectionPort);

    /*
    // FIXME: Revisit error handlers that were premised on the promise race of either server exit or server connect
    const futureBrowserConnect = this.karmaEventListener.receiveBrowserConnection(config.defaultSocketConnectionPort);
    const futureBrowserConnectOrServerExit = Promise.race([futureBrowserConnect, futureServerExit]);

    try {
      await futureBrowserConnectOrServerExit;
    } catch (error) {
      throw new Error(`Server quit unexpectedly: ${error.message || error}`);
    }
    */
  }

  public async stop(): Promise<void> {
    this.logger.info(`Stopping Karma server`);
    // this.karmaEventListener.disconnectFromKarma();

    if (this.karmaServerProcessHandler.isProcessRunning()) {
      await this.karmaServerProcessHandler.kill();
      this.logger.info(`Stopped Karma server`);
    } else {
      this.logger.info(`Karma server is not running`);
    }
  }

  public async restart(config: TestExplorerConfiguration): Promise<void> {
    this.logger.info(`Restarting Karma server`);
    
    if (this.isServerRunning()) {
      await this.stop();
    }
    this.start(config);
  }

  public isServerRunning(): boolean {
    return this.karmaServerProcessHandler.isProcessRunning();
  }
}
