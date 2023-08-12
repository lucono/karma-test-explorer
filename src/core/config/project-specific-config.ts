import { ExternalConfigSetting, GeneralConfigSetting } from './config-setting.js';

export type ProjectSpecificConfigSetting =
  | ExternalConfigSetting.ProjectRootPath
  | ExternalConfigSetting.RootPath
  | ExternalConfigSetting.ProjectType
  | ExternalConfigSetting.KarmaConfigFilePath
  | GeneralConfigSetting.TestFramework
  | GeneralConfigSetting.Browser
  | GeneralConfigSetting.CustomLauncher
  | GeneralConfigSetting.TestFiles
  | GeneralConfigSetting.ExcludedFiles
  | GeneralConfigSetting.TestsBasePath;

export type ProjectSpecificConfig = { [key in ExternalConfigSetting.RootPath]: string } & {
  [key in Exclude<ProjectSpecificConfigSetting, ExternalConfigSetting.RootPath>]?: unknown;
};
