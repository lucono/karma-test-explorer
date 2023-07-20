import { DebugConfiguration } from 'vscode';

import { parse as parseDotEnvContent } from 'dotenv';
import { CustomLauncher } from 'karma';
import { resolve } from 'path';

import { CHROME_BROWSER_DEBUGGING_PORT_FLAG, CHROME_DEFAULT_DEBUGGING_PORT } from '../../constants.js';
import { FileHandler } from '../../util/filesystem/file-handler.js';
import { Logger } from '../../util/logging/logger.js';
import {
  asNonBlankStringOrUndefined,
  expandEnvironment,
  normalizePath,
  stripJsComments,
  transformObject
} from '../../util/utils.js';
import { BrowserHelperFactory } from './browsers/browser-factory.js';
import { GeneralConfigSetting, ProjectConfigSetting } from './config-setting.js';
import { ConfigStore } from './config-store.js';

export const getDefaultDebugPort = (
  browser: string | undefined,
  customLauncher: CustomLauncher,
  debuggerConfigName: string | undefined,
  debuggerConfig: DebugConfiguration,
  config: ConfigStore<ProjectConfigSetting>
): number | undefined => {
  if (browser || debuggerConfigName) {
    return;
  }
  const defaultCustomLauncher = config.inspect<CustomLauncher>(GeneralConfigSetting.CustomLauncher)?.defaultValue;
  const defaultDebuggerConfig = config.inspect<DebugConfiguration>(GeneralConfigSetting.DebuggerConfig)?.defaultValue;

  if (customLauncher.base !== defaultCustomLauncher?.base || debuggerConfig.type !== defaultDebuggerConfig?.type) {
    return;
  }

  let configuredPort: number | undefined;

  const browserDebugPortFlag = customLauncher.flags?.find(flag => flag.startsWith(CHROME_BROWSER_DEBUGGING_PORT_FLAG));

  if (browserDebugPortFlag) {
    const portPosition = browserDebugPortFlag.search(/[0-9]+$/g);
    const portString = portPosition !== -1 ? browserDebugPortFlag.substring(portPosition) : undefined;
    configuredPort = portString ? parseInt(portString, 10) : undefined;
  }

  return configuredPort ?? CHROME_DEFAULT_DEBUGGING_PORT;
};

/**
 * Attempts to parse custom launch configuration and browser type from user settings
 * @param config - The project config settings
 * @param projectKarmaConfigFilePath - The path to the karma.config.js file for this project
 * @param fileHandler
 * @param logger
 * @returns An object containing the determined browser type, and whether it has been overriden in settings or not
 * If the custom launcher is overriden in settings, this will also be returned
 */
export const getCustomLaunchConfiguration = (
  config: ConfigStore<ProjectConfigSetting>,
  projectKarmaConfigFilePath: string,
  fileHandler: FileHandler,
  logger: Logger
): {
  browserType: string;
  customLauncher: CustomLauncher | undefined;
  userOverride: boolean;
} => {
  const rawConfig = getRawKarmaConfig(projectKarmaConfigFilePath, fileHandler);
  const browserType = asNonBlankStringOrUndefined(config.get<string>(GeneralConfigSetting.Browser));

  if (browserType !== undefined) {
    const customLauncherBrowserType = getBrowserTypeFromKarmaConfigCustomLauncher(browserType, rawConfig) ?? '';
    if (BrowserHelperFactory.isSupportedBrowser(customLauncherBrowserType)) {
      logger.debug(() => `Using user-specified browser custom launcher: ${browserType}`);
      //  Custom launcher will be ignored when the browser config is set, so return undefined custom launcher even though we got the base type from it
      return {
        browserType: customLauncherBrowserType,
        customLauncher: undefined,
        userOverride: true
      };
    }

    logger.debug(() => `Using user-specified browser: ${browserType}`);
    return {
      browserType,
      customLauncher: undefined,
      userOverride: true
    };
  }

  const customLauncherInsp = config.inspect<CustomLauncher>(GeneralConfigSetting.CustomLauncher);
  const customLauncherConfigured =
    (customLauncherInsp?.workspaceFolderValue ??
      customLauncherInsp?.workspaceValue ??
      customLauncherInsp?.globalValue) !== undefined;
  if (customLauncherConfigured) {
    const customLauncher = config.get<CustomLauncher>(GeneralConfigSetting.CustomLauncher);
    logger.debug(() => `Using user-specified custom launcher based on: ${customLauncher.base}`);
    //  User has specified the custom launcher configuration, so it must be returned
    return {
      browserType: customLauncher.base,
      customLauncher,
      userOverride: true
    };
  }

  const karmaConfigBrowsers = getBrowsersFromKarmaConfig(rawConfig);
  for (const browser of karmaConfigBrowsers) {
    if (BrowserHelperFactory.isSupportedBrowser(browser)) {
      logger.debug(() => `Using project-specified browser: ${browser}`);
      return {
        browserType: browser,
        customLauncher: undefined,
        userOverride: false
      };
    }

    const browserType = getBrowserTypeFromKarmaConfigCustomLauncher(browser, rawConfig) ?? '';
    if (BrowserHelperFactory.isSupportedBrowser(browserType)) {
      logger.debug(() => `Using project-specified custom launcher: ${browser}`);
      //  The custom launcher config will be looked up by the karma config loader, so we don't need to return it here
      return {
        browserType,
        customLauncher: undefined,
        userOverride: false
      };
    }
  }

  logger.debug(() => 'Using default launcher');
  return {
    browserType: 'Chrome',
    customLauncher: undefined,
    userOverride: false
  };
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

export const getMergedDebuggerConfig = (
  workspaceFolderPath: string,
  baseDebugConfig: DebugConfiguration,
  webRootOverride?: string,
  extraPathMappings?: Readonly<Record<string, string>>,
  extraSourceMapPathOverrides?: Readonly<Record<string, string>>
): DebugConfiguration => {
  const hasPathMapping = baseDebugConfig.pathMapping || extraPathMappings;
  const hasSourceMapPathOverrides = baseDebugConfig.sourceMapPathOverrides || extraSourceMapPathOverrides;

  const webRoot: string | undefined = (webRootOverride ?? baseDebugConfig.webRoot)?.replace(
    /\${workspaceFolder}/g,
    workspaceFolderPath
  );

  const replaceWorkspacePath = (key: string, value: string) => ({
    key,
    value: value
      .replace(/\${webRoot}/g, webRoot ?? workspaceFolderPath)
      .replace(/\${workspaceFolder}/g, workspaceFolderPath)
  });

  const pathMapping = transformObject({ ...baseDebugConfig.pathMapping, ...extraPathMappings }, replaceWorkspacePath);

  const sourceMapPathOverrides = transformObject(
    { ...baseDebugConfig.sourceMapPathOverrides, ...extraSourceMapPathOverrides },
    replaceWorkspacePath
  );

  const mergedDebuggerConfig: DebugConfiguration = { ...baseDebugConfig };

  if (webRoot) {
    mergedDebuggerConfig.webRoot = webRoot;
  }

  if (hasPathMapping) {
    mergedDebuggerConfig.pathMapping = pathMapping;
  }

  if (hasSourceMapPathOverrides) {
    mergedDebuggerConfig.sourceMapPathOverrides = sourceMapPathOverrides;
  }
  return mergedDebuggerConfig;
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
  projectRootPath: string,
  config: ConfigStore<ProjectConfigSetting>,
  fileHandler: FileHandler,
  logger: Logger
): Record<string, string> => {
  const envMap: Record<string, string> = config.get(GeneralConfigSetting.Env) ?? {};
  let environment: Record<string, string> = { ...envMap };

  const envFile: string | undefined = stringSettingExists(config, GeneralConfigSetting.EnvFile)
    ? resolve(projectRootPath, config.get<string>(GeneralConfigSetting.EnvFile)!)
    : undefined;

  if (envFile) {
    logger.info(() => `Reading environment from file: ${envFile}`);

    try {
      const envFileContent = fileHandler.readFileSync(envFile);

      if (!envFileContent) {
        throw new Error(`Failed to read configured environment file: ${envFile}`);
      }
      const envFileEnvironment = parseDotEnvContent(envFileContent);
      const entryCount = Object.keys(envFileEnvironment).length;
      logger.info(() => `Fetched ${entryCount} entries from environment file: ${envFile}`);

      const mergedEnvironment = { ...envFileEnvironment, ...environment };
      const expandedEnvironment = expandEnvironment(mergedEnvironment, logger);

      environment = expandedEnvironment ?? mergedEnvironment;
    } catch (error) {
      logger.error(() => `Failed to get environment from file '${envFile}': ${error}`);
    }
  }

  return environment;
};

export const stringSettingExists = (
  config: ConfigStore<ProjectConfigSetting>,
  setting: GeneralConfigSetting
): boolean => {
  const value: string | undefined = config.get(setting);
  return (value ?? '').trim().length > 0;
};
