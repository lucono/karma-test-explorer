import { ExternalConfigSetting, GeneralConfigSetting } from './config-setting';

export type ProjectSpecificConfigSetting =
  | ExternalConfigSetting.ProjectRootPath
  | ExternalConfigSetting.ProjectType
  | ExternalConfigSetting.KarmaConfFilePath
  | GeneralConfigSetting.TestFramework
  | GeneralConfigSetting.TestFiles
  | GeneralConfigSetting.ExcludeFiles
  | GeneralConfigSetting.TestsBasePath;

export type ProjectSpecificConfig = { [key in ExternalConfigSetting.ProjectRootPath]: string } & {
  [key in Exclude<ProjectSpecificConfigSetting, ExternalConfigSetting.ProjectRootPath>]?: unknown;
};
