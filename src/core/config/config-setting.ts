export type WorkspaceConfigSetting = GeneralConfigSetting | ExternalConfigSetting;
export type ProjectConfigSetting = GeneralConfigSetting | InternalConfigSetting;

export enum InternalConfigSetting {
  ProjectName = 'internal_projectName',
  ProjectType = 'internal_projectType',
  ProjectPath = 'internal_projectPath',
  ProjectInstallRootPath = 'internal_projectInstallRootPath',
  ProjectKarmaConfigFilePath = 'internal_projectKarmaConfigFilePath'
}

export enum ExternalConfigSetting {
  EnableExtension = 'enableExtension',
  ProjectType = 'projectType',
  ProjectWorkspaces = 'projectWorkspaces',
  Projects = 'projects', // FIXME: Deprecated - remove
  RootPath = 'rootPath',
  ProjectRootPath = 'projectRootPath', // FIXME: Deprecated - remove
  KarmaConfFilePath = 'karmaConfFilePath', // FIXME: Deprecated - remove
  KarmaConfigFilePath = 'karmaConfigFilePath'
}

export enum GeneralConfigSetting {
  KarmaPort = 'karmaPort',
  KarmaProcessCommand = 'karmaProcessCommand',
  AngularProcessCommand = 'angularProcessCommand',
  TestTriggerMethod = 'testTriggerMethod',
  TestParsingMethod = 'testParsingMethod',
  EnabledParserPlugins = 'enabledParserPlugins',
  Browser = 'browser',
  CustomLauncher = 'customLauncher',
  NonHeadlessModeEnabled = 'nonHeadlessModeEnabled', // FIXME: Deprecated - remove
  ShowBrowserWindow = 'showBrowserWindow',
  TestsBasePath = 'testsBasePath',
  TestFiles = 'testFiles',
  ExcludeFiles = 'excludeFiles', // FIXME: Deprecated - remove
  ExcludedFiles = 'excludedFiles',
  TestGrouping = 'testGrouping',
  FlattenSingleChildFolders = 'flattenSingleChildFolders',
  ReloadOnChangedFiles = 'reloadOnChangedFiles',
  ReloadOnKarmaConfigChange = 'reloadOnKarmaConfigChange',
  DefaultSocketConnectionPort = 'defaultSocketConnectionPort',
  DebuggerConfigName = 'debuggerConfigName',
  DebuggerConfig = 'debuggerConfig',
  WebRoot = 'webRoot',
  PathMapping = 'pathMapping',
  SourceMapPathOverrides = 'sourceMapPathOverrides',
  LogLevel = 'logLevel',
  KarmaLogLevel = 'karmaLogLevel',
  KarmaReporterLogLevel = 'karmaReporterLogLevel',
  Env = 'env', // FIXME: Deprecated - remove
  EnvironmentVariables = 'environmentVariables',
  EnvFile = 'envFile', // FIXME: Deprecated - remove
  EnvironmentFile = 'environmentFile',
  EnvExclude = 'envExclude', // FIXME: Deprecated - remove
  ExcludedEnvironmentVariables = 'excludedEnvironmentVariables',
  AutoWatchEnabled = 'autoWatchEnabled',
  AutoWatchBatchDelay = 'autoWatchBatchDelay',
  KarmaReadyTimeout = 'karmaReadyTimeout',
  TestFramework = 'testFramework',
  ContainerMode = 'containerMode',
  FailOnStandardError = 'failOnStandardError',
  AllowGlobalPackageFallback = 'allowGlobalPackageFallback',
  ExcludeDisabledTests = 'excludeDisabledTests',
  ShowUnmappedTests = 'showUnmappedTests',
  ShowTestDefinitionTypeIndicators = 'showTestDefinitionTypeIndicators',
  ShowOnlyFocusedTests = 'showOnlyFocusedTests'
}

export const DEPRECATED_CONFIG_SETTINGS: (ExternalConfigSetting | GeneralConfigSetting)[] = [
  ExternalConfigSetting.Projects,
  ExternalConfigSetting.ProjectRootPath,
  ExternalConfigSetting.KarmaConfFilePath,
  GeneralConfigSetting.NonHeadlessModeEnabled,
  GeneralConfigSetting.Env,
  GeneralConfigSetting.EnvFile,
  GeneralConfigSetting.EnvExclude,
  GeneralConfigSetting.ExcludeFiles
];
