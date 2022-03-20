export type ConfigSetting = InternalConfigSetting | ExternalConfigSetting;

export enum InternalConfigSetting {
  ProjectSubFolderPath = 'projectSubFolderPath'
}

export enum ExternalConfigSetting {
  EnableExtension = 'enableExtension',
  ProjectRootPath = 'projectRootPath',
  KarmaConfFilePath = 'karmaConfFilePath',
  KarmaPort = 'karmaPort',
  KarmaProcessCommand = 'karmaProcessCommand',
  AngularProcessCommand = 'angularProcessCommand',
  DefaultAngularProjectName = 'defaultAngularProjectName',
  TestTriggerMethod = 'testTriggerMethod',
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
  ProjectType = 'projectType',
  TestFramework = 'testFramework',
  ContainerMode = 'containerMode',
  FailOnStandardError = 'failOnStandardError',
  AllowGlobalPackageFallback = 'allowGlobalPackageFallback',
  ExcludeDisabledTests = 'excludeDisabledTests',
  ShowUnmappedTests = 'showUnmappedTests',
  ShowTestDefinitionTypeIndicators = 'showTestDefinitionTypeIndicators',
  ShowOnlyFocusedTests = 'showOnlyFocusedTests'
}
