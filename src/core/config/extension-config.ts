import { CustomLauncher } from 'karma';
import { resolve } from 'path';
import { DebugConfiguration } from 'vscode';
import { ALWAYS_EXCLUDED_TEST_FILE_GLOBS } from '../../constants';
import { KarmaLogLevel } from '../../frameworks/karma/karma-log-level';
import { Disposable } from '../../util/disposable/disposable';
import { Disposer } from '../../util/disposable/disposer';
import { LogLevel } from '../../util/logging/log-level';
import { Logger } from '../../util/logging/logger';
import { asNonBlankStringOrUndefined, normalizePath, toSingleUniqueArray } from '../../util/utils';
import { ProjectType } from '../base/project-type';
import { TestFrameworkName } from '../base/test-framework-name';
import { TestGrouping } from '../base/test-grouping';
import {
  getCombinedEnvironment,
  getCustomLauncher,
  getDefaultDebugPort,
  getMergedDebuggerConfig,
  getTestsBasePath
} from './config-helper';
import { ConfigSetting, InternalConfigSetting, WorkspaceConfigSetting } from './config-setting';
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
  public readonly projectSubFolderPath: string;
  public readonly autoWatchBatchDelay?: number;
  public readonly autoWatchEnabled: boolean;
  public readonly baseKarmaConfFilePath: string;
  public readonly browser?: string;
  public readonly customLauncher: Readonly<CustomLauncher>;
  public readonly debuggerConfig: Readonly<DebugConfiguration>;
  public readonly debuggerConfigName?: string;
  public readonly selectedAngularProject?: string;
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
  public readonly projectType?: ProjectType;
  public readonly testFramework?: TestFrameworkName;
  public readonly testGrouping: TestGrouping;
  public readonly testsBasePath?: string;
  public readonly userKarmaConfFilePath: string;
  public readonly testTriggerMethod: TestTriggerMethod;
  public readonly failOnStandardError: boolean;
  public readonly allowGlobalPackageFallback: boolean;
  public readonly excludeDisabledTests: boolean;
  public readonly showOnlyFocusedTests: boolean;
  public readonly showTestDefinitionTypeIndicators: boolean;
  public readonly showUnmappedTests: boolean;

  public constructor(configStore: ConfigStore<ConfigSetting>, workspacePath: string, private readonly logger: Logger) {
    const normalizedWorkspacePath = normalizePath(workspacePath);

    this.projectRootPath = normalizePath(
      resolve(normalizedWorkspacePath, configStore.get(WorkspaceConfigSetting.ProjectRootPath)!)
    );
    this.projectSubFolderPath = normalizePath(
      resolve(this.projectRootPath, configStore.get(InternalConfigSetting.ProjectSubFolderPath)!)
    );
    this.karmaPort = configStore.get(WorkspaceConfigSetting.KarmaPort)!;
    this.karmaProcessCommand = asNonBlankStringOrUndefined(configStore.get(WorkspaceConfigSetting.KarmaProcessCommand));
    this.angularProcessCommand = asNonBlankStringOrUndefined(
      configStore.get(WorkspaceConfigSetting.AngularProcessCommand)
    );
    this.testTriggerMethod = configStore.get<TestTriggerMethod>(WorkspaceConfigSetting.TestTriggerMethod);
    this.failOnStandardError = !!configStore.get(WorkspaceConfigSetting.FailOnStandardError);
    this.testsBasePath = getTestsBasePath(this.projectRootPath, this.projectSubFolderPath, configStore);
    this.defaultSocketConnectionPort = configStore.get(WorkspaceConfigSetting.DefaultSocketConnectionPort)!;
    this.logLevel = configStore.get<LogLevel>(WorkspaceConfigSetting.LogLevel);
    this.karmaLogLevel = configStore.get<KarmaLogLevel>(WorkspaceConfigSetting.KarmaLogLevel);
    this.karmaReporterLogLevel = configStore.get<LogLevel>(WorkspaceConfigSetting.KarmaReporterLogLevel);
    this.autoWatchEnabled = !!configStore.get(WorkspaceConfigSetting.AutoWatchEnabled);
    this.autoWatchBatchDelay = configStore.get(WorkspaceConfigSetting.AutoWatchBatchDelay);
    this.karmaReadyTimeout = configStore.get(WorkspaceConfigSetting.KarmaReadyTimeout)!;
    this.baseKarmaConfFilePath = normalizePath(resolve(__dirname, './karma.conf'));
    this.testGrouping = configStore.get(WorkspaceConfigSetting.TestGrouping)!;
    this.flattenSingleChildFolders = !!configStore.get(WorkspaceConfigSetting.FlattenSingleChildFolders);
    this.environment = getCombinedEnvironment(this.projectRootPath, configStore, logger);
    this.projectType = configStore.get(WorkspaceConfigSetting.ProjectType);
    this.testFramework = configStore.get(WorkspaceConfigSetting.TestFramework);
    this.reloadOnKarmaConfigChange = !!configStore.get(WorkspaceConfigSetting.ReloadOnKarmaConfigChange);
    this.selectedAngularProject = configStore.get(InternalConfigSetting.SelectedAngularProject);
    this.customLauncher = getCustomLauncher(configStore);
    this.browser = asNonBlankStringOrUndefined(configStore.get(WorkspaceConfigSetting.Browser));
    this.testFiles = configStore
      .get<string[]>(WorkspaceConfigSetting.TestFiles)
      .map(fileGlob => normalizePath(fileGlob));
    this.allowGlobalPackageFallback = !!configStore.get(WorkspaceConfigSetting.AllowGlobalPackageFallback);
    this.excludeDisabledTests = !!configStore.get(WorkspaceConfigSetting.ExcludeDisabledTests);
    this.showOnlyFocusedTests = !!configStore.get(WorkspaceConfigSetting.ShowOnlyFocusedTests);
    this.showUnmappedTests = !!configStore.get(WorkspaceConfigSetting.ShowUnmappedTests);
    this.showTestDefinitionTypeIndicators = !!configStore.get(WorkspaceConfigSetting.ShowTestDefinitionTypeIndicators);
    this.debuggerConfigName = asNonBlankStringOrUndefined(configStore.get(WorkspaceConfigSetting.DebuggerConfigName));

    this.debuggerConfig = getMergedDebuggerConfig(
      normalizedWorkspacePath,
      configStore.get(WorkspaceConfigSetting.DebuggerConfig)!,
      configStore.get(WorkspaceConfigSetting.WebRoot),
      configStore.get(WorkspaceConfigSetting.PathMapping),
      configStore.get(WorkspaceConfigSetting.SourceMapPathOverrides)
    );

    this.userKarmaConfFilePath = normalizePath(
      resolve(this.projectRootPath, configStore.get(WorkspaceConfigSetting.KarmaConfFilePath))
    );

    this.reloadOnChangedFiles = (configStore.get<string[]>(WorkspaceConfigSetting.ReloadOnChangedFiles) || []).map(
      filePath => normalizePath(resolve(this.projectRootPath, filePath))
    );

    this.defaultDebugPort = getDefaultDebugPort(
      this.browser,
      this.customLauncher,
      this.debuggerConfigName,
      this.debuggerConfig,
      configStore
    );

    this.excludeFiles = toSingleUniqueArray(
      configStore.get(WorkspaceConfigSetting.ExcludeFiles),
      ALWAYS_EXCLUDED_TEST_FILE_GLOBS
    ).map(fileGlob => normalizePath(fileGlob));
  }

  public async dispose() {
    await Disposer.dispose(this.logger);
  }
}
