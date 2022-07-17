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
  Projects = 'projects',
  ProjectRootPath = 'projectRootPath', // FIXME: Deprecated - remove
  KarmaConfFilePath = 'karmaConfFilePath'
}

export enum GeneralConfigSetting {
  KarmaPort = 'karmaPort',
  KarmaProcessCommand = 'karmaProcessCommand',
  AngularProcessCommand = 'angularProcessCommand',
  TestTriggerMethod = 'testTriggerMethod',
  TestParsingMethod = 'testParsingMethod',
  Browser = 'browser',
  CustomLauncher = 'customLauncher',
  NonHeadlessModeEnabled = 'nonHeadlessModeEnabled',
  TestsBasePath = 'testsBasePath',
  TestFiles = 'testFiles',
  ExcludeFiles = 'excludeFiles',
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
  Env = 'env',
  EnvFile = 'envFile',
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
