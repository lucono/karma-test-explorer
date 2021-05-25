import { Logger } from "../../util/logger";
import { ExtensionConfig } from "../../core/extension-config";
import { TestServerExecutor } from "../../api/test-server-executor";
// import { join } from "path";
// import { existsSync } from "fs";
import { AngularTestServerExecutor } from "../angular/angular-test-server-executor";
import { getDefaultAngularProject } from "../angular/angular-config-loader";
// import { KarmaFactory } from "../karma/karma-factory";

export class AngularFactory {

  public constructor(
    // private readonly karmaFactory: KarmaFactory,
    private readonly config: ExtensionConfig,
    private readonly logger: Logger
  ) {}

  public createTestServerExecutor(): TestServerExecutor {
    const angularProject = getDefaultAngularProject(this.config.projectRootPath);

    const environment: { [key: string]: string | undefined } = {
      ...process.env,
      ...this.config.envFileEnvironment,
      ...this.config.env
    };
    return new AngularTestServerExecutor(
      angularProject,
      this.config.projectRootPath,
      this.config.baseKarmaConfFilePath,
      { environment },
      this.logger);
  }

  // private isAngularProject(): boolean {
  //   const angularJsonPath = join(this.config.projectRootPath, "angular.json");
  //   const angularCliJsonPath = join(this.config.projectRootPath, ".angular-cli.json");

  //   return (existsSync(angularJsonPath) || existsSync(angularCliJsonPath));
  // }
}
