import { parse as parseEnvironmentFile } from 'dotenv';
import dotenvExpand from 'dotenv-expand';
import { readFileSync } from 'fs';
import { CustomLauncher } from 'karma';
import { resolve } from 'path';
import { DebugConfiguration, WorkspaceConfiguration } from 'vscode';
import packageJson from '../../../package.json';
import {
  CHROME_BROWSER_DEBUGGING_PORT_FLAG,
  CHROME_DEFAULT_DEBUGGING_PORT,
  EXTENSION_CONFIG_PREFIX,
  KARMA_BROWSER_CONTAINER_NO_SANDBOX_FLAG
} from '../../constants';
import { KarmaLogLevel } from '../../frameworks/karma/karma-logger';
import { Disposable } from '../../util/disposable/disposable';
import { Disposer } from '../../util/disposable/disposer';
import { LogLevel, LogLevelName } from '../../util/logging/log-level';
import { Logger } from '../../util/logging/logger';
import { TestFrameworkName } from '../base/test-framework-name';
import { TestGrouping } from '../base/test-grouping';
import { ConfigSetting } from './config-setting';

type ExtensionConfigContribution = typeof packageJson.contributes.configuration;

type ExtensionConfigKey = `${typeof EXTENSION_CONFIG_PREFIX}.${ConfigSetting}`;

export class ExtensionConfig implements Disposable {
  public readonly autoWatchBatchDelay: number;
  public readonly autoWatchEnabled: boolean;
  public readonly baseKarmaConfFilePath: string;
  public readonly browser: string;
  public readonly containerModeEnabled: boolean;
  public readonly customLauncher: Readonly<CustomLauncher>;
  public readonly debuggerConfig: Readonly<DebugConfiguration>;
  public readonly debuggerConfigName: string;
  public readonly defaultAngularProjectName: string;
  public readonly envFile: string | undefined;
  public readonly environment: Readonly<Record<string, string>>;
  public readonly excludeFiles: readonly string[];
  public readonly logLevel: LogLevel | undefined;
  public readonly flattenSingleChildFolders: boolean;
  public readonly karmaLogLevel: KarmaLogLevel;
  public readonly karmaPort: number;
  public readonly defaultSocketConnectionPort: number;
  public readonly defaultDebugPort: number | undefined;
  public readonly karmaProcessExecutable: string;
  public readonly karmaReadyTimeout: number;
  public readonly projectRootPath: string;
  public readonly reloadOnChangedFiles: readonly string[];
  public readonly reloadOnKarmaConfigChange: boolean;
  public readonly testFiles: readonly string[];
  public readonly testFramework: TestFrameworkName;
  public readonly testGrouping: TestGrouping;
  public readonly testsBasePath: string;
  public readonly userKarmaConfFilePath: string;

  public constructor(config: WorkspaceConfiguration, workspaceVSCODEPath: string, private readonly logger: Logger) {
    const workspacePath = workspaceVSCODEPath.replace(/^\/([A-Za-z]):\//, '$1:/');

    this.projectRootPath = resolve(workspacePath, config.get(ConfigSetting.ProjectRootPath)!);
    this.userKarmaConfFilePath = resolve(this.projectRootPath, config.get(ConfigSetting.KarmaConfFilePath)!);
    this.karmaPort = config.get(ConfigSetting.KarmaPort)!;
    this.karmaProcessExecutable = config.get(ConfigSetting.KarmaProcessExecutable)!;
    this.testsBasePath = resolve(this.projectRootPath, config.get(ConfigSetting.TestsBasePath)!);
    this.testFiles = config.get(ConfigSetting.TestFiles)!;
    this.excludeFiles = config.get(ConfigSetting.ExcludeFiles) ?? [];
    this.defaultSocketConnectionPort = config.get(ConfigSetting.DefaultSocketConnectionPort)!;
    this.logLevel = LogLevel[config.get<string>(ConfigSetting.LogLevel)!.toUpperCase() as LogLevelName];
    this.karmaLogLevel = config.get<string>(ConfigSetting.KarmaLogLevel)!.toUpperCase() as KarmaLogLevel;
    this.autoWatchEnabled = !!config.get(ConfigSetting.AutoWatchEnabled);
    this.autoWatchBatchDelay = config.get(ConfigSetting.AutoWatchBatchDelay)!;
    this.karmaReadyTimeout = config.get(ConfigSetting.KarmaReadyTimeout)!;
    this.baseKarmaConfFilePath = resolve(__dirname, './karma.conf');
    this.testGrouping = config.get(ConfigSetting.TestGrouping)!;
    this.flattenSingleChildFolders = !!config.get(ConfigSetting.FlattenSingleChildFolders);
    this.environment = this.getCombinedEnvironment(config);
    this.testFramework = config.get(ConfigSetting.TestFramework)!;
    this.reloadOnKarmaConfigChange = !!config.get(ConfigSetting.ReloadOnKarmaConfigChange);
    this.defaultAngularProjectName = config.get(ConfigSetting.DefaultAngularProjectName)!;
    this.containerModeEnabled = !!config.get(ConfigSetting.ContainerModeEnabled);
    this.customLauncher = this.getCustomLauncher(config.get(ConfigSetting.CustomLauncher)!, this.containerModeEnabled);
    this.browser = config.get(ConfigSetting.Browser)!;
    this.debuggerConfig = config.get(ConfigSetting.DebuggerConfig)!;
    this.debuggerConfigName = config.get(ConfigSetting.DebuggerConfigName)!;

    this.defaultDebugPort = this.getDefaultDebugPort(
      this.browser,
      this.customLauncher,
      this.debuggerConfigName,
      this.debuggerConfig
    );

    this.reloadOnChangedFiles = (config.get<string[]>(ConfigSetting.ReloadOnChangedFiles) ?? []).map(filePath =>
      resolve(this.projectRootPath, filePath)
    );
  }

  private getDefaultDebugPort(
    browser: string,
    customLauncher: CustomLauncher,
    debuggerConfigName: string,
    debuggerConfig: DebugConfiguration
  ): number | undefined {
    if (browser || debuggerConfigName) {
      return;
    }
    const configContribution: ExtensionConfigContribution = packageJson.contributes.configuration;

    const defaultCustomLauncher = this.getConfiguredDefault<CustomLauncher>(
      ConfigSetting.CustomLauncher,
      configContribution
    );

    const defaultDebuggerConfig = this.getConfiguredDefault<DebugConfiguration>(
      ConfigSetting.DebuggerConfig,
      configContribution
    );

    if (customLauncher.base !== defaultCustomLauncher?.base || debuggerConfig.type !== defaultDebuggerConfig?.type) {
      return;
    }

    let configuredPort: number | undefined;

    const browserDebugPortFlag = customLauncher.flags?.find(flag =>
      flag.startsWith(CHROME_BROWSER_DEBUGGING_PORT_FLAG)
    );

    if (browserDebugPortFlag) {
      const portPosition = browserDebugPortFlag.search(/[0-9]+$/g);
      const portString = portPosition !== -1 ? browserDebugPortFlag.substring(portPosition) : undefined;
      configuredPort = portString ? parseInt(portString, 10) : undefined;
    }

    return configuredPort ?? CHROME_DEFAULT_DEBUGGING_PORT;
  }

  private getCustomLauncher(configuredLauncher: CustomLauncher, isContainerMode: boolean): CustomLauncher {
    if (!isContainerMode || configuredLauncher.base.toLocaleLowerCase().indexOf('chrome') === -1) {
      return configuredLauncher;
    }

    let launcherFlags = (configuredLauncher.flags ??= []);

    launcherFlags = launcherFlags.includes(KARMA_BROWSER_CONTAINER_NO_SANDBOX_FLAG)
      ? launcherFlags
      : [...launcherFlags, KARMA_BROWSER_CONTAINER_NO_SANDBOX_FLAG];

    configuredLauncher.flags = launcherFlags;

    return configuredLauncher;
  }

  private getConfiguredDefault<R>(setting: ConfigSetting, packageConfig: ExtensionConfigContribution): R | undefined {
    const configKey: ExtensionConfigKey = `${EXTENSION_CONFIG_PREFIX}.${setting}`;
    const settingConfig = packageConfig.properties[configKey];
    const defaultValue = 'default' in settingConfig ? settingConfig.default : undefined;
    return defaultValue as R;
  }

  private getCombinedEnvironment(config: WorkspaceConfiguration): Record<string, string> {
    const envMap: Record<string, string> = config.get(ConfigSetting.Env) ?? {};

    const envFile: string | undefined = this.stringSettingExists(config, ConfigSetting.EnvFile)
      ? resolve(this.projectRootPath, config.get<string>(ConfigSetting.EnvFile)!)
      : undefined;

    if (!envFile) {
      return envMap;
    }
    this.logger.info(() => `Reading environment from file: ${envFile}`);

    let envFileEnvironment: Record<string, string> = {};

    try {
      const envFileContent: Buffer = readFileSync(envFile!);

      if (!envFileContent) {
        throw new Error(`Failed to read configured environment file: ${envFile}`);
      }
      envFileEnvironment = parseEnvironmentFile(envFileContent);
      dotenvExpand({ parsed: envFileEnvironment });
      const entryCount = Object.keys(envFileEnvironment).length;
      this.logger.info(() => `Fetched ${entryCount} entries from environment file: ${envFile}`);
    } catch (error) {
      this.logger.error(() => `Failed to get environment from file '${envFile}': ${error}`);
    }

    return { ...envFileEnvironment, ...envMap };
  }

  private stringSettingExists(config: WorkspaceConfiguration, setting: ConfigSetting): boolean {
    const value: string | undefined = config.get(setting);
    return (value ?? '').trim().length > 0;
  }

  public async dispose() {
    await Disposer.dispose(this.logger);
  }
}
