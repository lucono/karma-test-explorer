import { CommandlineProcessHandler } from "../../a-new-structure/util/commandline-process-handler";

export interface ServerCommandHandler {
  start: (
    karmaPort: number,
    karmaSocketPort: number) => CommandlineProcessHandler;
    
  run: (
    karmaPort: number,
    clientArgs: string[]) => CommandlineProcessHandler;
}


// import { SpawnOptions } from "child_process";
// import { Logger } from "../helpers/logger";
// import { CommandlineProcessHandler } from "../integration/commandline-process-handler";
// import { join } from "path";
// import { existsSync } from "fs";
// import { silent } from "resolve-global";
// import { window } from "vscode";

// export class ServerCommandHandler {
//   public constructor(
//     private readonly logger: Logger,
//     private readonly serverProcessLogger: (data: string) => void = logger.info.bind(logger),
//     private readonly serverProcessErrorLogger: (data: string) => void = logger.error.bind(logger))
//   {}

//   public start(
//     karmaConfigFilePath: string,
//     projectRootPath: string,
//     environment: { [key: string]: string } = {},
//     customServerCommand?: string): CommandlineProcessHandler
//   {
//     return this.execute('start', karmaConfigFilePath, projectRootPath, environment, customServerCommand);
//   }

//   public run(
//     karmaConfigFilePath: string,
//     projectRootPath: string,
//     clientArgs: string[] = [],
//     environment: { [key: string]: string } = {},
//     customServerCommand?: string): CommandlineProcessHandler
//   {
//     return this.execute('run', karmaConfigFilePath, projectRootPath, environment, customServerCommand, clientArgs);
//   }

//   private execute(
//     karmaOperation: 'start' | 'run',
//     karmaConfigFilePath: string,
//     projectRootPath: string,
//     environment: { [key: string]: string } = {},
//     customServerCommand?: string,
//     clientArgs: string[] = []): CommandlineProcessHandler
//   {
//     const spawnOptions: SpawnOptions = {
//       cwd: projectRootPath,
//       shell: true,
//       env: environment
//     };

//     const localKarmaPath = join(projectRootPath, "node_modules", "karma", "bin", "karma");
//     const isKarmaInstalledLocally = existsSync(localKarmaPath);
//     const isKarmaInstalledGlobally = silent("karma") !== undefined;

//     let command: string;
//     let processArguments: string[] = [];

//     if (customServerCommand) {
//       command = customServerCommand;

//     } else if (isKarmaInstalledLocally) {
//       command = "npx";
//       processArguments = [ "karma" ];

//     } else if (isKarmaInstalledGlobally) {
//       command = "karma";

//     } else {
//       const errorMessage = `Karma does not seem to be installed. Please install it and try again.`;
//       window.showErrorMessage(errorMessage);
//       throw new Error(errorMessage);
//     }

//     const escapedClientArgs: string[] = clientArgs.map(arg => arg.replace(/[\W ]/g, "\\$&"));
//     processArguments = [ ...processArguments, karmaOperation, karmaConfigFilePath, "--", ...escapedClientArgs ];

//     const serverProcess = new CommandlineProcessHandler(
//       this.logger, 
//       command, 
//       processArguments, 
//       spawnOptions,
//       this.serverProcessLogger,
//       this.serverProcessErrorLogger);

//     return serverProcess;
//   }
// }
