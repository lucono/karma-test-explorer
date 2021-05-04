import path = require("path");
import { WorkspaceConfiguration } from "vscode";
import { ConfigSetting } from "./enums/config-setting"

export class TestExplorerConfiguration {
  public readonly projectRootPath: string;
  public readonly userKarmaConfFilePath: string;
  public readonly karmaPort: number;
  public readonly baseKarmaConfFilePath: string;
  public readonly karmaProcessExecutable: string;
  public readonly testFiles: string[];
  public readonly excludeFiles: string[];
  public readonly reloadWatchedFiles: string[];
  public readonly reloadOnKarmaConfigurationFileChange: boolean;
  public readonly defaultSocketConnectionPort: number;
  public readonly env: { [key: string]: string };
  public readonly envFile: string | undefined;
  public readonly debuggerConfig: any;
  public readonly debugLevelLogging: boolean;

  public constructor(config: WorkspaceConfiguration, workspaceVSCODEPath: string)
  {
    const workspacePath = workspaceVSCODEPath.replace(/^\/([A-Za-z]):\//, "$1:/");

    this.projectRootPath = path.join(workspacePath, config.get(ConfigSetting.ProjectRootPath) as string);
    this.userKarmaConfFilePath = path.resolve(this.projectRootPath, config.get(ConfigSetting.KarmaConfFilePath) as string);
    this.karmaPort = config.get(ConfigSetting.KarmaPort) as number;
    this.karmaProcessExecutable = config.get(ConfigSetting.KarmaProcessExecutable) as string;
    this.testFiles = config.get(ConfigSetting.TestFiles) as string[];
    this.excludeFiles = config.get(ConfigSetting.ExcludeFiles) as string[];
    this.reloadOnKarmaConfigurationFileChange = config.get(ConfigSetting.ReloadOnKarmaConfigurationFileChange) as boolean;
    this.defaultSocketConnectionPort = config.get(ConfigSetting.DefaultSocketConnectionPort) as number;
    this.debuggerConfig = JSON.parse(JSON.stringify(config.get(ConfigSetting.DebuggerConfig)));
    this.env = JSON.parse(JSON.stringify(config.get(ConfigSetting.Env)));
    this.debugLevelLogging = config.get(ConfigSetting.DebugLevelLogging) as boolean;
    this.baseKarmaConfFilePath = path.join(__dirname, "..", "config", "test-explorer-karma.conf.js");

    this.envFile = !this.stringSettingExists(config, ConfigSetting.EnvFile) ? undefined :
      path.resolve(this.projectRootPath, config.get(ConfigSetting.EnvFile) as string);

    this.reloadWatchedFiles = (config.get(ConfigSetting.ReloadWatchedFiles) as string[])
      .map(filePath => path.resolve(this.projectRootPath, filePath));
  }

  private stringSettingExists(config: WorkspaceConfiguration, setting: ConfigSetting): boolean {
    const value: string | undefined = config.get(setting);
    return (value ?? '').trim().length > 0;
  }
}
