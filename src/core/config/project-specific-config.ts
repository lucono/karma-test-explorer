import { ExternalConfigSetting, GeneralConfigSetting } from './config-setting.js';

export type ProjectSpecificConfigSetting =
  | ExternalConfigSetting.ProjectRootPath
  | ExternalConfigSetting.RootPath
  | ExternalConfigSetting.ProjectType
  | ExternalConfigSetting.KarmaConfFilePath
  | GeneralConfigSetting.TestFramework
  | GeneralConfigSetting.TestFiles
  | GeneralConfigSetting.ExcludeFiles
  | GeneralConfigSetting.TestsBasePath;

export type ProjectSpecificConfig = { [key in ExternalConfigSetting.RootPath]: string } & {
  [key in Exclude<ProjectSpecificConfigSetting, ExternalConfigSetting.RootPath>]?: unknown;
};
