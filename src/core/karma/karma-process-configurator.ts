import { SpawnOptions } from "child_process";

export class KarmaProcessConfigurator {
  public constructor() {}

  public createProcessOptions(
    projectRootPath: string, 
    userKarmaConfigPath: string, 
    defaultSocketPort: number, 
    extraEnvironment?: { [key: string]: string | undefined }
  ) {
    const testExplorerEnvironment = {
      ...process.env,
      ...extraEnvironment,
      userKarmaConfigPath,
      defaultSocketPort: `${defaultSocketPort}`
    };
    const options = {
      cwd: projectRootPath,
      shell: true,
      env: testExplorerEnvironment,
    } as SpawnOptions;
    return options;
  }

  public createProcessCommandAndArguments(baseKarmaConfigFilePath: string) {
    const command = "npx";
    const processArguments = ["karma", "start", baseKarmaConfigFilePath];

    return { command, processArguments };
  }
}
