import { parse as parseDotEnvContent } from 'dotenv';
import isDocker from 'is-docker';
import { CustomLauncher } from 'karma';
import { resolve } from 'path';

import { FileHandler } from '../../util/filesystem/file-handler.js';
import { Logger } from '../../util/logging/logger.js';
import { asNonBlankStringOrUndefined, expandEnvironment, normalizePath, stripJsComments } from '../../util/utils.js';
import { BrowserHelperProvider } from './browsers/browser-helper-provider.js';
import { GeneralConfigSetting, ProjectConfigSetting, WorkspaceConfigSetting } from './config-setting.js';
import { ConfigStore } from './config-store.js';
import { ContainerMode } from './extension-config.js';

/**
 * Attempts to parse custom launch configuration and browser type from user settings
 * @param config - The project config settings
 * @param projectKarmaConfigFilePath - The path to the karma.config.js file for this project
 * @param fileHandler
 * @param logger
 * @returns An object containing the determined browser type, and whether it has been overriden in settings or not
 * If the custom launcher is overriden in settings, this will also be returned
 */
export const getBrowserType = (
  configuredBrowserType: string | undefined,
  configuredCustomLauncher: CustomLauncher | undefined,
  projectKarmaConfigFilePath: string | undefined,
  browserHelperProvider: BrowserHelperProvider,
  fileHandler: FileHandler,
  logger: Logger
): string => {
  const rawConfig = projectKarmaConfigFilePath ? getRawKarmaConfig(projectKarmaConfigFilePath, fileHandler) : undefined;

  if (configuredBrowserType) {
    const karmaConfiguredBrowserType = getBrowserTypeFromKarmaConfigCustomLauncher(configuredBrowserType, rawConfig);

    const browserType =
      karmaConfiguredBrowserType && browserHelperProvider.isSupportedBrowser(karmaConfiguredBrowserType)
        ? karmaConfiguredBrowserType
        : configuredBrowserType;

    logger.debug(
      () =>
        `Using configured browser from ` +
        `${browserType === configuredBrowserType ? 'extension settings' : 'karma config'}: ` +
        `${configuredBrowserType}`
    );

    return browserType;
  }

  if (configuredCustomLauncher) {
    logger.debug(() => `Using user-specified custom launcher with base type: ${configuredCustomLauncher.base}`);

    return configuredCustomLauncher.base;
  }

  const karmaConfigBrowsers = getBrowsersFromKarmaConfig(rawConfig);

  for (const karmaConfigBrowser of karmaConfigBrowsers) {
    if (browserHelperProvider.isSupportedBrowser(karmaConfigBrowser)) {
      logger.debug(() => `Selecting Karma config browser: ${karmaConfigBrowser}`);

      return karmaConfigBrowser;
    }

    const browserType = getBrowserTypeFromKarmaConfigCustomLauncher(karmaConfigBrowser, rawConfig);

    if (browserType && browserHelperProvider.isSupportedBrowser(browserType)) {
      logger.debug(
        () => `Selecting Karma config custom launcher '${karmaConfigBrowser}' with browser type: ${browserType}`
      );

      return browserType;
    }
  }

  const defaultBrowserType = browserHelperProvider.getDefaultBrowserHelper().debuggerType;

  logger.debug(() => `Using default browser type: ${defaultBrowserType}`);

  return defaultBrowserType;
};

const getRawKarmaConfig = (karmaConfigPath: string, fileHandler: FileHandler): string | undefined => {
  const rawConfigContent = fileHandler.readFileSync(karmaConfigPath);
  return rawConfigContent ? stripJsComments(rawConfigContent).replace(/\s/g, '') : undefined;
};

const getBrowsersFromKarmaConfig = (rawConfig: string | undefined): string[] => {
  const matchResult = rawConfig ? /browsers:\[([^\]]*)\]/g.exec(rawConfig)?.[1] : '';
  const browserList = matchResult?.split(',').map(entry => entry.replace(/(^['"`]|['"`]$)/g, '')) ?? [];

  return browserList;
};

const getBrowserTypeFromKarmaConfigCustomLauncher = (
  customBrowserName: string,
  rawConfig: string | undefined
): string | undefined => {
  const matchResult = rawConfig
    ? new RegExp(`["']?${customBrowserName}["']?:(\{[^\}]*\})`, 'g').exec(rawConfig)?.[1]
    : '';
  const configParts = matchResult?.split(',') ?? [];
  const baseValue = configParts
    .find(entry => entry.includes('base'))
    ?.split(':')[1]
    ?.replace(/(^['"`]|['"`]$)/g, '');
  return asNonBlankStringOrUndefined(baseValue);
};

export const getTestsBasePath = (
  projectPath: string,
  config: ConfigStore<ProjectConfigSetting>
): string | undefined => {
  const configuredTestsBasePath = asNonBlankStringOrUndefined(config.get(GeneralConfigSetting.TestsBasePath));

  if (configuredTestsBasePath === undefined) {
    return undefined;
  }
  const resolvedTestsBasePath = normalizePath(resolve(projectPath, configuredTestsBasePath));
  return resolvedTestsBasePath;
};

export const getCombinedEnvironment = (
  configuredEnvironment: Record<string, string>,
  environmentFile: string | undefined,
  fileHandler: FileHandler,
  logger: Logger
): Record<string, string> => {
  let environment: Record<string, string> = { ...configuredEnvironment };

  if (environmentFile) {
    logger.info(() => `Reading environment from file: ${environmentFile}`);

    try {
      const envFileContent = fileHandler.readFileSync(environmentFile);

      if (!envFileContent) {
        throw new Error(`Failed to read configured environment file: ${environmentFile}`);
      }
      const envFileEnvironment = parseDotEnvContent(envFileContent);
      const entryCount = Object.keys(envFileEnvironment).length;
      logger.info(() => `Fetched ${entryCount} entries from environment file: ${environmentFile}`);

      const mergedEnvironment = { ...envFileEnvironment, ...environment };
      const expandedEnvironment = expandEnvironment(mergedEnvironment, logger);

      environment = expandedEnvironment ?? mergedEnvironment;
    } catch (error) {
      logger.error(() => `Failed to get environment from file '${environmentFile}': ${error}`);
    }
  }

  return environment;
};

export const isSettingConfigured = <T extends ProjectConfigSetting | WorkspaceConfigSetting>(
  configSetting: T,
  workspaceConfig: ConfigStore<T>
): boolean => {
  const setting = workspaceConfig.inspect(configSetting);

  const isSettingConfigured =
    setting?.workspaceFolderValue !== undefined ||
    setting?.workspaceValue !== undefined ||
    setting?.globalValue !== undefined;

  return isSettingConfigured;
};

export const getConfigValue = <
  T,
  K extends ProjectConfigSetting | WorkspaceConfigSetting = ProjectConfigSetting | WorkspaceConfigSetting
>(
  workspaceConfig: ConfigStore<K>,
  configSetting: K,
  ...configSettingAliases: K[]
): T => {
  const configuredSetting: K =
    [configSetting, ...configSettingAliases].find(setting => isSettingConfigured(setting, workspaceConfig)) ??
    configSetting;

  return workspaceConfig.get<T>(configuredSetting);
};

export const isContainerModeEnabled = (configuredContainerMode: ContainerMode | undefined): boolean =>
  configuredContainerMode === ContainerMode.Enabled
    ? true
    : configuredContainerMode === ContainerMode.Disabled
    ? false
    : isDocker();
