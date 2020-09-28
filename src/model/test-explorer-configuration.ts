import path = require("path");

export class TestExplorerConfiguration {
  public constructor(config: any, workspaceVSCODEPath: string) {
    const workspacePath = workspaceVSCODEPath.replace(/^\/([A-Za-z]):\//, "$1:/");

    this.projectRootPath = path.join(workspacePath, config.get("projectRootPath") as string);
    this.defaultSocketConnectionPort = config.get("defaultSocketConnectionPort") as number;
    this.userKarmaConfFilePath = path.resolve(this.projectRootPath, config.get("karmaConfFilePath") as string);
    this.baseKarmaConfFilePath = path.join(__dirname, "..", "config", "test-explorer-karma.conf.js");
    this.testFiles = config.get("testFiles") as string[];
    this.excludeFiles = config.get("excludeFiles") as string[];
    this.debuggerConfig = JSON.parse(JSON.stringify(config.get("debuggerConfig")));
    this.env = JSON.parse(JSON.stringify(config.get("env")));
  }

  public defaultSocketConnectionPort: number;
  public projectRootPath: string;
  public userKarmaConfFilePath: string;
  public baseKarmaConfFilePath: string;
  public testFiles: string[];
  public excludeFiles: string[];
  public debuggerConfig: any;
  public env: { [key: string]: string };
}
