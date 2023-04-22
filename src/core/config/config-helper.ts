import { DebugConfiguration } from 'vscode';

import { parse as parseDotEnvContent } from 'dotenv';
import { CustomLauncher, Config as KarmaConfig } from 'karma';
import { resolve } from 'path';

import { CHROME_BROWSER_DEBUGGING_PORT_FLAG, CHROME_DEFAULT_DEBUGGING_PORT } from '../../constants.js';
import { FileHandler } from '../../util/filesystem/file-handler.js';
import { Logger } from '../../util/logging/logger.js';
import { asNonBlankStringOrUndefined, expandEnvironment, normalizePath, transformObject } from '../../util/utils.js';
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

export const loadProjectKarmaConfigFile = (projectKarmaConfigPath: string): KarmaConfig => {
  let loadedConfiguration: any = {};
  const fakeConfig = {
    set: (newConfig: any) => {
      loadedConfiguration = { ...loadedConfiguration, ...newConfig };
    }
  };

  let projectKarmaConfigModule = require(projectKarmaConfigPath); // eslint-disable-line @typescript-eslint/no-var-requires

  // https://github.com/karma-runner/karma/blob/v1.7.0/lib/config.js#L364
  if (typeof projectKarmaConfigModule === 'object' && typeof projectKarmaConfigModule.default !== 'undefined') {
    projectKarmaConfigModule = projectKarmaConfigModule.default;
  }

  projectKarmaConfigModule(fakeConfig);
  return loadedConfiguration;
};

export const getCustomLaunchConfiguration = (
  config: ConfigStore<ProjectConfigSetting>,
  projectConfig: KarmaConfig
): {
  browserType: string;
  customLauncher: CustomLauncher | undefined;
} => {
  let browserType = config.get<string>(GeneralConfigSetting.Browser);
  if (browserType !== '') {
    if (projectConfig.customLaunchers?.[browserType] !== undefined) {
      const customLauncher: CustomLauncher = projectConfig.customLaunchers[browserType];
      return {
        browserType: customLauncher.base,
        customLauncher
      };
    }

    return {
      browserType,
      customLauncher: undefined
    };
  }

  const customLauncherInsp = config.inspect<CustomLauncher>(GeneralConfigSetting.CustomLauncher);
  const customLauncherConfigured =
    (customLauncherInsp?.workspaceFolderValue ??
      customLauncherInsp?.workspaceValue ??
      customLauncherInsp?.globalValue) !== undefined;
  if (customLauncherConfigured) {
    const customLauncher = config.get<CustomLauncher>(GeneralConfigSetting.CustomLauncher);
    return {
      browserType: customLauncher.base,
      customLauncher
    };
  }

  browserType = Array.isArray(projectConfig.browsers) ? projectConfig.browsers[0] : 'Chrome';

  if (projectConfig.customLaunchers?.[browserType] !== undefined) {
    const customLauncher: CustomLauncher = projectConfig.customLaunchers[browserType];
    return {
      browserType: customLauncher.base,
      customLauncher
    };
  }

  return {
    browserType,
    customLauncher: undefined
  };
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
