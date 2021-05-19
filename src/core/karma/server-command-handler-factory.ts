import { Logger } from "../../a-new-structure/util/logger";
import { ServerCommandHandler } from './server-command-handler';
import { join } from 'path';
import { existsSync } from 'fs';
import { AngularTestServerExecutor } from '../../a-new-structure/frameworks/angular/angular-test-server-executor';
import { KarmaCommandLineExecutor } from '../../a-new-structure/frameworks/karma/karma-command-line-executor';

export class ServerCommandHandlerFactory {

  public constructor(
    private readonly workspaceRootPath: string,
    private readonly logger: Logger,
    private readonly serverProcessLogger: (data: string, serverPort: number) => void = logger.info.bind(logger),
    private readonly serverProcessErrorLogger: (data: string, serverPort: number) => void = logger.error.bind(logger)

  ) {}

  public createServerCommandHandler(): ServerCommandHandler {
    const angularJsonPath = join(this.workspaceRootPath, "angular.json");
    const angularCliJsonPath = join(this.workspaceRootPath, ".angular-cli.json");
    const isAngularProject: boolean = (existsSync(angularJsonPath) || existsSync(angularCliJsonPath));

    return isAngularProject
      ? new AngularTestServerExecutor(this.logger, this.serverProcessErrorLogger, this.serverProcessErrorLogger)
      : new KarmaCommandLineExecutor(this.logger, this.serverProcessLogger, this.serverProcessErrorLogger);
  }
}
