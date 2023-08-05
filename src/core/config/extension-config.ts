import { DebugConfiguration } from 'vscode';

import { ParserPlugin } from '@babel/parser';
import { CustomLauncher } from 'karma';
import { resolve } from 'path';

import { ALWAYS_EXCLUDED_TEST_FILE_GLOBS, EXTENSION_DEBUGGER_LABEL } from '../../constants.js';
import { KarmaLogLevel } from '../../frameworks/karma/karma-log-level.js';
import { Disposable } from '../../util/disposable/disposable.js';
import { Disposer } from '../../util/disposable/disposer.js';
import { FileHandler } from '../../util/filesystem/file-handler.js';
import { LogLevel } from '../../util/logging/log-level.js';
import { Logger } from '../../util/logging/logger.js';
import {
  asNonBlankStringOrUndefined,
  asNonEmptyArrayOrUndefined,
  normalizePath,
  toSingleUniqueArray
} from '../../util/utils.js';
import { ProjectType } from '../base/project-type.js';
import { TestFrameworkName } from '../base/test-framework-name.js';
import { TestGrouping } from '../base/test-grouping.js';
import { BrowserHelperProvider } from './browsers/browser-helper-provider.js';
import {
  getBrowserType,
  getCombinedEnvironment,
  getConfigValue,
  getTestsBasePath,
  isSettingConfigured
} from './config-helper.js';
import { GeneralConfigSetting, InternalConfigSetting, ProjectConfigSetting } from './config-setting.js';
import { ConfigStore } from './config-store.js';

export enum ContainerMode {
  Auto = 'auto',
  Enabled = 'enabled',
  Disabled = 'disabled'
}

export enum TestTriggerMethod {
  Http = 'http',
  Cli = 'cli'
}

export enum TestParsingMethod {
  AST = 'ast',
  RegExp = 'regexp'
}

export class ExtensionConfig implements Disposable {
  // Internal Settings
  public readonly projectType: ProjectType;
  public readonly projectName: string;
  public readonly projectPath: string;
  public readonly projectInstallRootPath: string;
  public readonly projectKarmaConfigFilePath?: string;

  // General Settings
  public readonly autoWatchBatchDelay: number;
  public readonly autoWatchEnabled: boolean;
  public readonly baseKarmaConfFilePath: string;
  public readonly browser?: string;
  public readonly customLauncher: Readonly<CustomLauncher>;
  public readonly debuggerConfig: Readonly<DebugConfiguration>;
  public readonly debuggerConfigName?: string;
  public readonly environmentFile?: string;
  public readonly environment: Readonly<Record<string, string>>;
  public readonly excludedEnvironmentVariables: readonly string[];
  public readonly excludedFiles: readonly string[];
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
  public readonly testsBasePath?: string;
  public readonly testTriggerMethod: TestTriggerMethod;
  public readonly testParsingMethod: TestParsingMethod;
  public readonly failOnStandardError: boolean;
  public readonly allowGlobalPackageFallback: boolean;
  public readonly excludeDisabledTests: boolean;
  public readonly showOnlyFocusedTests: boolean;
  public readonly showTestDefinitionTypeIndicators: boolean;
  public readonly showUnmappedTests: boolean;
  public readonly enabledParserPlugins?: readonly ParserPlugin[];

  public constructor(
    configStore: ConfigStore<ProjectConfigSetting>,
    workspacePath: string,
    fileHandler: FileHandler,
    private readonly logger: Logger
  ) {
    const normalizedWorkspacePath = normalizePath(workspacePath);

    // Internal Settings
    this.projectType = configStore.get(InternalConfigSetting.ProjectType);
    this.projectName = configStore.get(InternalConfigSetting.ProjectName);
    this.projectPath = configStore.get(InternalConfigSetting.ProjectPath)!;
    this.projectInstallRootPath = configStore.get(InternalConfigSetting.ProjectInstallRootPath)!;
    this.projectKarmaConfigFilePath = configStore.get(InternalConfigSetting.ProjectKarmaConfigFilePath);
    this.baseKarmaConfFilePath = normalizePath(resolve(__dirname, './karma.conf.cjs'));

    // General Settings
    this.karmaPort = configStore.get(GeneralConfigSetting.KarmaPort)!;
    this.karmaProcessCommand = asNonBlankStringOrUndefined(configStore.get(GeneralConfigSetting.KarmaProcessCommand));
    this.angularProcessCommand = asNonBlankStringOrUndefined(
      configStore.get(GeneralConfigSetting.AngularProcessCommand)
    );
    this.testTriggerMethod = configStore.get<TestTriggerMethod>(GeneralConfigSetting.TestTriggerMethod);
    this.testParsingMethod = configStore.get<TestParsingMethod>(GeneralConfigSetting.TestParsingMethod);
    this.enabledParserPlugins = asNonEmptyArrayOrUndefined(
      configStore.get<ParserPlugin[]>(GeneralConfigSetting.EnabledParserPlugins)
    );
    this.failOnStandardError = !!configStore.get(GeneralConfigSetting.FailOnStandardError);
    this.testsBasePath = getTestsBasePath(this.projectPath, configStore);
    this.defaultSocketConnectionPort = configStore.get(GeneralConfigSetting.DefaultSocketConnectionPort)!;
    this.logLevel = configStore.get<LogLevel>(GeneralConfigSetting.LogLevel);
    this.karmaLogLevel = configStore.get<KarmaLogLevel>(GeneralConfigSetting.KarmaLogLevel);
    this.karmaReporterLogLevel = configStore.get<LogLevel>(GeneralConfigSetting.KarmaReporterLogLevel);
    this.autoWatchEnabled = !!configStore.get(GeneralConfigSetting.AutoWatchEnabled);
    this.autoWatchBatchDelay = configStore.get(GeneralConfigSetting.AutoWatchBatchDelay);
    this.karmaReadyTimeout = configStore.get(GeneralConfigSetting.KarmaReadyTimeout)!;
    this.testGrouping = configStore.get(GeneralConfigSetting.TestGrouping)!;
    this.flattenSingleChildFolders = !!configStore.get(GeneralConfigSetting.FlattenSingleChildFolders);
    this.testFramework = configStore.get(GeneralConfigSetting.TestFramework);
    this.reloadOnKarmaConfigChange = !!configStore.get(GeneralConfigSetting.ReloadOnKarmaConfigChange);
    this.browser = asNonBlankStringOrUndefined(configStore.get(GeneralConfigSetting.Browser));
    this.allowGlobalPackageFallback = !!configStore.get(GeneralConfigSetting.AllowGlobalPackageFallback);
    this.excludeDisabledTests = !!configStore.get(GeneralConfigSetting.ExcludeDisabledTests);
    this.showOnlyFocusedTests = !!configStore.get(GeneralConfigSetting.ShowOnlyFocusedTests);
    this.showUnmappedTests = !!configStore.get(GeneralConfigSetting.ShowUnmappedTests);
    this.showTestDefinitionTypeIndicators = !!configStore.get(GeneralConfigSetting.ShowTestDefinitionTypeIndicators);

    // -- Test Files

    const configuredExcludedFiles = getConfigValue<string[]>(
      configStore,
      GeneralConfigSetting.ExcludedFiles,
      GeneralConfigSetting.ExcludeFiles
    );

    this.testFiles = configStore.get<string[]>(GeneralConfigSetting.TestFiles).map(fileGlob => normalizePath(fileGlob));

    this.excludedFiles = toSingleUniqueArray(configuredExcludedFiles, ALWAYS_EXCLUDED_TEST_FILE_GLOBS).map(fileGlob =>
      normalizePath(fileGlob)
    );

    // -- Custom Launcher

    const configuredBrowser = asNonBlankStringOrUndefined(configStore.get(GeneralConfigSetting.Browser));

    const configuredCustomLauncher = isSettingConfigured(GeneralConfigSetting.CustomLauncher, configStore)
      ? configStore.get<CustomLauncher>(GeneralConfigSetting.CustomLauncher)
      : undefined;

    const browserHelperProvider = new BrowserHelperProvider();

    const browserType = getBrowserType(
      configuredBrowser,
      configuredCustomLauncher,
      this.projectKarmaConfigFilePath,
      browserHelperProvider,
      fileHandler,
      logger
    );

    const browserHelper = browserHelperProvider.getBrowserHelper(browserType);

    logger.debug(() => `Using browser helper with debugger type: ${browserHelper.debuggerType}`);

    const showBrowserWindow = getConfigValue(
      configStore,
      GeneralConfigSetting.ShowBrowserWindow,
      GeneralConfigSetting.NonHeadlessModeEnabled
    );

    const isHeadlessMode = !showBrowserWindow;

    this.customLauncher = browserHelper.getCustomLauncher(
      browserType,
      configuredCustomLauncher,
      configStore.get(GeneralConfigSetting.ContainerMode),
      isHeadlessMode
    );

    logger.debug(() => `Using custom launcher: ${JSON.stringify(this.customLauncher, undefined, 2)}}`);

    // -- Debugger

    this.debuggerConfigName = asNonBlankStringOrUndefined(configStore.get(GeneralConfigSetting.DebuggerConfigName));

    const configuredDebuggerConfig = isSettingConfigured(GeneralConfigSetting.DebuggerConfig, configStore)
      ? configStore.get<DebugConfiguration>(GeneralConfigSetting.DebuggerConfig)
      : undefined;

    logger.trace(() => `Configured debugger config: ${JSON.stringify(configuredDebuggerConfig, undefined, 2)}}`);

    const debuggerConfig = browserHelper.getDebuggerConfig({
      baseDebugConfig: configuredDebuggerConfig,
      workspaceFolderPath: normalizedWorkspacePath,
      webRootOverride: configStore.get(GeneralConfigSetting.WebRoot),
      extraPathMappings: configStore.get(GeneralConfigSetting.PathMapping),
      extraSourceMapPathOverrides: configStore.get(GeneralConfigSetting.SourceMapPathOverrides)
    });

    this.debuggerConfig = {
      ...debuggerConfig,
      name: `${EXTENSION_DEBUGGER_LABEL} (${debuggerConfig.type})`,
      type: debuggerConfig.type,
      request: debuggerConfig.request
    };

    logger.debug(() => `Using debugger config: ${JSON.stringify(this.debuggerConfig, undefined, 2)}}`);

    this.defaultDebugPort =
      this.browser || this.debuggerConfigName
        ? undefined
        : browserHelper.getDebugPort(this.customLauncher, this.debuggerConfig);

    logger.debug(() => `Using default debug port: ${this.defaultDebugPort}}`);

    // -- Environment

    const configuredEnvironment: Record<string, string> =
      getConfigValue(configStore, GeneralConfigSetting.EnvironmentVariables, GeneralConfigSetting.Env) ?? {};

    const unresolvedEnvironmentFile = asNonBlankStringOrUndefined(
      getConfigValue(configStore, GeneralConfigSetting.EnvironmentFile, GeneralConfigSetting.EnvFile)
    );

    this.environmentFile = unresolvedEnvironmentFile ? resolve(this.projectPath, unresolvedEnvironmentFile) : undefined;
    this.environment = getCombinedEnvironment(configuredEnvironment, this.environmentFile, fileHandler, logger);

    this.excludedEnvironmentVariables = getConfigValue(
      configStore,
      GeneralConfigSetting.ExcludedEnvironmentVariables,
      GeneralConfigSetting.EnvExclude
    );

    this.reloadOnChangedFiles = (configStore.get<string[]>(GeneralConfigSetting.ReloadOnChangedFiles) || []).map(
      filePath => normalizePath(resolve(this.projectPath, filePath))
    );
  }

  public async dispose() {
    await Disposer.dispose(this.logger);
  }
}
