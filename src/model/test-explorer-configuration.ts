import path = require("path");
import { WorkspaceConfiguration } from "vscode";
import { ConfigSetting } from "./enums/config-setting"

export class TestExplorerConfiguration {
  public constructor(config: WorkspaceConfiguration, workspaceVSCODEPath: string) {
    const workspacePath = workspaceVSCODEPath.replace(/^\/([A-Za-z]):\//, "$1:/");

    this.projectRootPath = path.join(workspacePath, config.get(ConfigSetting.ProjectRootPath) as string);
    this.userKarmaConfFilePath = path.resolve(this.projectRootPath, config.get(ConfigSetting.KarmaConfFilePath) as string);
    this.karmaPort = config.get(ConfigSetting.KarmaPort) as number;
    this.karmaProcessExecutable = config.get(ConfigSetting.KarmaProcessExecutable) as string;
    this.testFiles = config.get(ConfigSetting.TestFiles) as string[];
    this.excludeFiles = config.get(ConfigSetting.ExcludeFiles) as string[];
    this.defaultSocketConnectionPort = config.get(ConfigSetting.DefaultSocketConnectionPort) as number;
    this.env = JSON.parse(JSON.stringify(config.get(ConfigSetting.Env)));
    this.debuggerConfig = JSON.parse(JSON.stringify(config.get(ConfigSetting.DebuggerConfig)));
    this.baseKarmaConfFilePath = path.join(__dirname, "..", "config", "test-explorer-karma.conf.js");
  }

  public projectRootPath: string;
  public userKarmaConfFilePath: string;
  public karmaPort: number;
  public baseKarmaConfFilePath: string;
  public karmaProcessExecutable: string;
  public testFiles: string[];
  public excludeFiles: string[];
  public defaultSocketConnectionPort: number;
  public env: { [key: string]: string };
  public debuggerConfig: any;
}
