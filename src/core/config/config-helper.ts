import { parse as parseDotEnvContent } from 'dotenv';
import { readFileSync } from 'fs';
import isDocker from 'is-docker';
import { CustomLauncher } from 'karma';
import { resolve } from 'path';
import { DebugConfiguration } from 'vscode';
import {
  CHROME_BROWSER_DEBUGGING_PORT_FLAG,
  CHROME_DEFAULT_DEBUGGING_PORT,
  KARMA_BROWSER_CONTAINER_HEADLESS_FLAGS,
  KARMA_BROWSER_CONTAINER_NO_SANDBOX_FLAG
} from '../../constants';
import { Logger } from '../../util/logging/logger';
import { expandEnvironment, transformProperties } from '../../util/utils';
import { ConfigSetting } from './config-setting';
import { ConfigStore } from './config-store';
import { ContainerMode } from './extension-config';

export const getDefaultDebugPort = (
  browser: string | undefined,
  customLauncher: CustomLauncher,
  debuggerConfigName: string | undefined,
  debuggerConfig: DebugConfiguration,
  config: ConfigStore
): number | undefined => {
  if (browser || debuggerConfigName) {
    return;
  }
  const defaultCustomLauncher = config.inspect<CustomLauncher>(ConfigSetting.CustomLauncher)?.defaultValue;
  const defaultDebuggerConfig = config.inspect<DebugConfiguration>(ConfigSetting.DebuggerConfig)?.defaultValue;

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

export const getCustomLauncher = (config: ConfigStore): CustomLauncher => {
  const configuredLauncher: CustomLauncher = config.get(ConfigSetting.CustomLauncher);
  const configuredContainerMode: ContainerMode = config.get(ConfigSetting.ContainerMode);
  const isNonHeadlessMode = !!config.get(ConfigSetting.NonHeadlessModeEnabled);

  const isContainerMode =
    configuredContainerMode === ContainerMode.Enabled
      ? true
      : configuredContainerMode === ContainerMode.Disabled
      ? false
      : isDocker();

  if ((configuredLauncher.base ?? '').toLowerCase().indexOf('chrome') === -1) {
    return configuredLauncher;
  }

  let launcherFlags = (configuredLauncher.flags ??= []);

  if (isContainerMode && !launcherFlags.includes(KARMA_BROWSER_CONTAINER_NO_SANDBOX_FLAG)) {
    launcherFlags = [...launcherFlags, KARMA_BROWSER_CONTAINER_NO_SANDBOX_FLAG];
  }

  if (!isContainerMode && configuredLauncher.base === 'Chrome' && isNonHeadlessMode) {
    launcherFlags = launcherFlags.filter(flag => !KARMA_BROWSER_CONTAINER_HEADLESS_FLAGS.includes(flag));
  }

  const customLauncher: CustomLauncher = { ...configuredLauncher, flags: launcherFlags };
  return customLauncher;
};

export const getMergedDebuggerConfig = (
  workspacePath: string,
  baseDebugConfig: DebugConfiguration,
  webRootOverride?: string,
  extraPathMappings?: Readonly<Record<string, string>>,
  extraSourceMapPathOverrides?: Readonly<Record<string, string>>
): DebugConfiguration => {
  const hasPathMapping = baseDebugConfig.pathMapping || extraPathMappings;
  const hasSourceMapPathOverrides = baseDebugConfig.sourceMapPathOverrides || extraSourceMapPathOverrides;

  const webRoot: string | undefined = (webRootOverride ?? baseDebugConfig.webRoot)?.replace(
    /\${workspaceFolder}/g,
    workspacePath
  );

  const replaceWorkspacePath = (value: string) =>
    value.replace(/\${webRoot}/g, webRoot ?? workspacePath).replace(/\${workspaceFolder}/g, workspacePath);

  const pathMapping = transformProperties(replaceWorkspacePath, {
    ...baseDebugConfig.pathMapping,
    ...extraPathMappings
  });

  const sourceMapPathOverrides = transformProperties(replaceWorkspacePath, {
    ...baseDebugConfig.sourceMapPathOverrides,
    ...extraSourceMapPathOverrides
  });

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

export const getCombinedEnvironment = (
  projectRootPath: string,
  config: ConfigStore,
  logger: Logger
): Record<string, string> => {
  const envMap: Record<string, string> = config.get(ConfigSetting.Env) ?? {};
  let environment: Record<string, string> = { ...envMap };

  const envFile: string | undefined = stringSettingExists(config, ConfigSetting.EnvFile)
    ? resolve(projectRootPath, config.get<string>(ConfigSetting.EnvFile)!)
    : undefined;

  if (envFile) {
    logger.info(() => `Reading environment from file: ${envFile}`);

    try {
      const envFileContent: Buffer = readFileSync(envFile!);

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

export const stringSettingExists = (config: ConfigStore, setting: ConfigSetting): boolean => {
  const value: string | undefined = config.get(setting);
  return (value ?? '').trim().length > 0;
};
