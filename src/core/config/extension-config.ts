import { parse as parseDotEnvContent } from 'dotenv';
import { readFileSync } from 'fs';
import isDocker from 'is-docker';
import { CustomLauncher } from 'karma';
import { resolve } from 'path';
import { DebugConfiguration } from 'vscode';
import {
  ALWAYS_EXCLUDED_TEST_FILE_GLOBS,
  CHROME_BROWSER_DEBUGGING_PORT_FLAG,
  CHROME_DEFAULT_DEBUGGING_PORT,
  KARMA_BROWSER_CONTAINER_HEADLESS_FLAGS,
  KARMA_BROWSER_CONTAINER_NO_SANDBOX_FLAG
} from '../../constants';
import { KarmaLogLevel } from '../../frameworks/karma/karma-log-level';
import { Disposable } from '../../util/disposable/disposable';
import { Disposer } from '../../util/disposable/disposer';
import { LogLevel } from '../../util/logging/log-level';
import { Logger } from '../../util/logging/logger';
import { asNonBlankStringOrUndefined, expandEnvironment, normalizePath, toSingleUniqueArray } from '../../util/utils';
import { TestFrameworkName } from '../base/test-framework-name';
import { TestGrouping } from '../base/test-grouping';
import { ConfigSetting } from './config-setting';
import { ConfigStore } from './config-store';

export enum ContainerMode {
  Auto = 'auto',
  Enabled = 'enabled',
  Disabled = 'disabled'
}

export enum TestTriggerMethod {
  Http = 'http',
  Cli = 'cli'
}

export class ExtensionConfig implements Disposable {
  public readonly projectRootPath: string;
  public readonly autoWatchBatchDelay?: number;
  public readonly autoWatchEnabled: boolean;
  public readonly baseKarmaConfFilePath: string;
  public readonly browser?: string;
  public readonly customLauncher: Readonly<CustomLauncher>;
  public readonly debuggerConfig: Readonly<DebugConfiguration>;
  public readonly debuggerConfigName?: string;
  public readonly defaultAngularProjectName: string;
  public readonly envFile?: string;
  public readonly environment: Readonly<Record<string, string>>;
  public readonly excludeFiles: readonly string[];
  public readonly flattenSingleChildFolders: boolean;
  public readonly logLevel: LogLevel;
  public readonly karmaLogLevel: KarmaLogLevel;
  public readonly karmaReporterLogLevel: LogLevel;
  public readonly karmaPort: number;
  public readonly defaultSocketConnectionPort: number;
  public readonly defaultDebugPort?: number;
  public readonly angularProcessCommand?: string;
  public readonly karmaProcessCommand?: string;
  public readonly karmaReadyTimeout: number;
  public readonly reloadOnChangedFiles: readonly string[];
  public readonly reloadOnKarmaConfigChange: boolean;
  public readonly testFiles: readonly string[];
  public readonly testFramework?: TestFrameworkName;
  public readonly testGrouping: TestGrouping;
  public readonly testsBasePath: string;
  public readonly userKarmaConfFilePath: string;
  public readonly testTriggerMethod: TestTriggerMethod;
  public readonly failOnStandardError: boolean;
  public readonly allowGlobalPackageFallback: boolean;
  public readonly excludeDisabledTests: boolean;
  public readonly showOnlyFocusedTests: boolean;
  public readonly showTestDefinitionTypeIndicators: boolean;
  public readonly showUnmappedTests: boolean;

  public constructor(config: ConfigStore, workspacePath: string, private readonly logger: Logger) {
    const normalizedWorkspacePath = normalizePath(workspacePath);

    this.projectRootPath = normalizePath(resolve(normalizedWorkspacePath, config.get(ConfigSetting.ProjectRootPath)!));
    this.karmaPort = config.get(ConfigSetting.KarmaPort)!;
    this.karmaProcessCommand = asNonBlankStringOrUndefined(config.get(ConfigSetting.KarmaProcessCommand));
    this.angularProcessCommand = asNonBlankStringOrUndefined(config.get(ConfigSetting.AngularProcessCommand));
    this.testTriggerMethod = config.get<TestTriggerMethod>(ConfigSetting.TestTriggerMethod);
    this.failOnStandardError = !!config.get(ConfigSetting.FailOnStandardError);
    this.testsBasePath = normalizePath(resolve(this.projectRootPath, config.get(ConfigSetting.TestsBasePath)!));
    this.defaultSocketConnectionPort = config.get(ConfigSetting.DefaultSocketConnectionPort)!;
    this.logLevel = config.get<LogLevel>(ConfigSetting.LogLevel);
    this.karmaLogLevel = config.get<KarmaLogLevel>(ConfigSetting.KarmaLogLevel);
    this.karmaReporterLogLevel = config.get<LogLevel>(ConfigSetting.KarmaReporterLogLevel);
    this.autoWatchEnabled = !!config.get(ConfigSetting.AutoWatchEnabled);
    this.autoWatchBatchDelay = config.get(ConfigSetting.AutoWatchBatchDelay);
    this.karmaReadyTimeout = config.get(ConfigSetting.KarmaReadyTimeout)!;
    this.baseKarmaConfFilePath = normalizePath(resolve(__dirname, './karma.conf'));
    this.testGrouping = config.get(ConfigSetting.TestGrouping)!;
    this.flattenSingleChildFolders = !!config.get(ConfigSetting.FlattenSingleChildFolders);
    this.environment = this.getCombinedEnvironment(config);
    this.testFramework = config.get(ConfigSetting.TestFramework);
    this.reloadOnKarmaConfigChange = !!config.get(ConfigSetting.ReloadOnKarmaConfigChange);
    this.defaultAngularProjectName = config.get(ConfigSetting.DefaultAngularProjectName)!;
    this.customLauncher = this.getCustomLauncher(config);
    this.browser = asNonBlankStringOrUndefined(config.get(ConfigSetting.Browser));
    this.debuggerConfig = config.get(ConfigSetting.DebuggerConfig)!;
    this.debuggerConfigName = asNonBlankStringOrUndefined(config.get(ConfigSetting.DebuggerConfigName));
    this.testFiles = config.get<string[]>(ConfigSetting.TestFiles).map(fileGlob => normalizePath(fileGlob));
    this.allowGlobalPackageFallback = !!config.get(ConfigSetting.AllowGlobalPackageFallback);
    this.excludeDisabledTests = !!config.get(ConfigSetting.ExcludeDisabledTests);
    this.showOnlyFocusedTests = !!config.get(ConfigSetting.ShowOnlyFocusedTests);
    this.showUnmappedTests = !!config.get(ConfigSetting.ShowUnmappedTests);
    this.showTestDefinitionTypeIndicators = !!config.get(ConfigSetting.ShowTestDefinitionTypeIndicators);

    this.excludeFiles = toSingleUniqueArray(
      config.get(ConfigSetting.ExcludeFiles),
      ALWAYS_EXCLUDED_TEST_FILE_GLOBS
    ).map(fileGlob => normalizePath(fileGlob));

    this.userKarmaConfFilePath = normalizePath(
      resolve(this.projectRootPath, config.get(ConfigSetting.KarmaConfFilePath)!)
    );

    this.defaultDebugPort = this.getDefaultDebugPort(
      this.browser,
      this.customLauncher,
      this.debuggerConfigName,
      this.debuggerConfig,
      config
    );

    this.reloadOnChangedFiles = (config.get<string[]>(ConfigSetting.ReloadOnChangedFiles) || []).map(filePath =>
      normalizePath(resolve(this.projectRootPath, filePath))
    );
  }

  private getDefaultDebugPort(
    browser: string | undefined,
    customLauncher: CustomLauncher,
    debuggerConfigName: string | undefined,
    debuggerConfig: DebugConfiguration,
    config: ConfigStore
  ): number | undefined {
    if (browser || debuggerConfigName) {
      return;
    }
    const defaultCustomLauncher = config.inspect<CustomLauncher>(ConfigSetting.CustomLauncher)?.defaultValue;
    const defaultDebuggerConfig = config.inspect<DebugConfiguration>(ConfigSetting.DebuggerConfig)?.defaultValue;

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

  private getCustomLauncher(config: ConfigStore): CustomLauncher {
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
  }

  private getCombinedEnvironment(config: ConfigStore): Record<string, string> {
    const envMap: Record<string, string> = config.get(ConfigSetting.Env) ?? {};
    let environment: Record<string, string> = { ...envMap };

    const envFile: string | undefined = this.stringSettingExists(config, ConfigSetting.EnvFile)
      ? resolve(this.projectRootPath, config.get<string>(ConfigSetting.EnvFile)!)
      : undefined;

    if (envFile) {
      this.logger.info(() => `Reading environment from file: ${envFile}`);

      try {
        const envFileContent: Buffer = readFileSync(envFile!);

        if (!envFileContent) {
          throw new Error(`Failed to read configured environment file: ${envFile}`);
        }
        const envFileEnvironment = parseDotEnvContent(envFileContent);
        const entryCount = Object.keys(envFileEnvironment).length;
        this.logger.info(() => `Fetched ${entryCount} entries from environment file: ${envFile}`);

        const mergedEnvironment = { ...envFileEnvironment, ...environment };
        const expandedEnvironment = expandEnvironment(mergedEnvironment, this.logger);

        environment = expandedEnvironment ?? mergedEnvironment;
      } catch (error) {
        this.logger.error(() => `Failed to get environment from file '${envFile}': ${error}`);
      }
    }

    return environment;
  }

  private stringSettingExists(config: ConfigStore, setting: ConfigSetting): boolean {
    const value: string | undefined = config.get(setting);
    return (value ?? '').trim().length > 0;
  }

  public async dispose() {
    await Disposer.dispose(this.logger);
  }
}
