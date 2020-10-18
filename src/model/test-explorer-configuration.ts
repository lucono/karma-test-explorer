import path = require("path");

export class TestExplorerConfiguration {
  public constructor(config: any, workspaceVSCODEPath: string) {
    const workspacePath = workspaceVSCODEPath.replace(/^\/([A-Za-z]):\//, "$1:/");

    this.projectRootPath = path.join(workspacePath, config.get("projectRootPath") as string);
    this.userKarmaConfFilePath = path.resolve(this.projectRootPath, config.get("karmaConfFilePath") as string);
    this.karmaPort = config.get("karmaPort") as number;
    this.baseKarmaConfFilePath = path.join(__dirname, "..", "config", "test-explorer-karma.conf.js");
    this.karmaProcessExecutable = config.get("karmaProcessExecutable") as string;
    this.testFiles = config.get("testFiles") as string[];
    this.excludeFiles = config.get("excludeFiles") as string[];
    this.defaultSocketConnectionPort = config.get("defaultSocketConnectionPort") as number;
    this.debuggerConfig = JSON.parse(JSON.stringify(config.get("debuggerConfig")));
    this.env = JSON.parse(JSON.stringify(config.get("env")));
  }

  public projectRootPath: string;
  public userKarmaConfFilePath: string;
  public karmaPort: number;
  public baseKarmaConfFilePath: string;
  public karmaProcessExecutable: string;
  public testFiles: string[];
  public excludeFiles: string[];
  public defaultSocketConnectionPort: number;
  public debuggerConfig: any;
  public env: { [key: string]: string };
}
