export type ConfigSetting = InternalConfigSetting | WorkspaceConfigSetting | WorkspaceConfigSetting;

export enum InternalConfigSetting {
  ProjectSubFolderPath = 'projectSubFolderPath',
  SelectedAngularProject = 'selectedAngularProject'
}

export enum WorkspaceConfigSetting {
  EnableExtension = 'enableExtension',
  ProjectRootPath = 'projectRootPath',
  ProjectType = 'projectType',
  DefaultAngularProjects = 'defaultAngularProjects',
  DefaultAngularProjectName = 'defaultAngularProjectName', // FIXME: Deprecated - remove
  KarmaConfFilePath = 'karmaConfFilePath',
  KarmaPort = 'karmaPort',
  KarmaProcessCommand = 'karmaProcessCommand',
  AngularProcessCommand = 'angularProcessCommand',
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
  TestFramework = 'testFramework',
  ContainerMode = 'containerMode',
  FailOnStandardError = 'failOnStandardError',
  AllowGlobalPackageFallback = 'allowGlobalPackageFallback',
  ExcludeDisabledTests = 'excludeDisabledTests',
  ShowUnmappedTests = 'showUnmappedTests',
  ShowTestDefinitionTypeIndicators = 'showTestDefinitionTypeIndicators',
  ShowOnlyFocusedTests = 'showOnlyFocusedTests'
}
