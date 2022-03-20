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
  getMergedDebuggerConfig
} from './config-helper';
import { ConfigSetting, ExternalConfigSetting, InternalConfigSetting } from './config-setting';
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
      resolve(normalizedWorkspacePath, configStore.get(ExternalConfigSetting.ProjectRootPath)!)
    );
    this.projectSubFolderPath = normalizePath(
      resolve(this.projectRootPath, configStore.get(InternalConfigSetting.ProjectSubFolderPath)!)
    );
    this.karmaPort = configStore.get(ExternalConfigSetting.KarmaPort)!;
    this.karmaProcessCommand = asNonBlankStringOrUndefined(configStore.get(ExternalConfigSetting.KarmaProcessCommand));
    this.angularProcessCommand = asNonBlankStringOrUndefined(
      configStore.get(ExternalConfigSetting.AngularProcessCommand)
    );
    this.testTriggerMethod = configStore.get<TestTriggerMethod>(ExternalConfigSetting.TestTriggerMethod);
    this.failOnStandardError = !!configStore.get(ExternalConfigSetting.FailOnStandardError);
    this.testsBasePath = asNonBlankStringOrUndefined(configStore.get(ExternalConfigSetting.TestsBasePath));
    this.defaultSocketConnectionPort = configStore.get(ExternalConfigSetting.DefaultSocketConnectionPort)!;
    this.logLevel = configStore.get<LogLevel>(ExternalConfigSetting.LogLevel);
    this.karmaLogLevel = configStore.get<KarmaLogLevel>(ExternalConfigSetting.KarmaLogLevel);
    this.karmaReporterLogLevel = configStore.get<LogLevel>(ExternalConfigSetting.KarmaReporterLogLevel);
    this.autoWatchEnabled = !!configStore.get(ExternalConfigSetting.AutoWatchEnabled);
    this.autoWatchBatchDelay = configStore.get(ExternalConfigSetting.AutoWatchBatchDelay);
    this.karmaReadyTimeout = configStore.get(ExternalConfigSetting.KarmaReadyTimeout)!;
    this.baseKarmaConfFilePath = normalizePath(resolve(__dirname, './karma.conf'));
    this.testGrouping = configStore.get(ExternalConfigSetting.TestGrouping)!;
    this.flattenSingleChildFolders = !!configStore.get(ExternalConfigSetting.FlattenSingleChildFolders);
    this.environment = getCombinedEnvironment(this.projectRootPath, configStore, logger);
    this.projectType = configStore.get(ExternalConfigSetting.ProjectType);
    this.testFramework = configStore.get(ExternalConfigSetting.TestFramework);
    this.reloadOnKarmaConfigChange = !!configStore.get(ExternalConfigSetting.ReloadOnKarmaConfigChange);
    this.defaultAngularProjectName = configStore.get(ExternalConfigSetting.DefaultAngularProjectName)!;
    this.customLauncher = getCustomLauncher(configStore);
    this.browser = asNonBlankStringOrUndefined(configStore.get(ExternalConfigSetting.Browser));
    this.testFiles = configStore
      .get<string[]>(ExternalConfigSetting.TestFiles)
      .map(fileGlob => normalizePath(fileGlob));
    this.allowGlobalPackageFallback = !!configStore.get(ExternalConfigSetting.AllowGlobalPackageFallback);
    this.excludeDisabledTests = !!configStore.get(ExternalConfigSetting.ExcludeDisabledTests);
    this.showOnlyFocusedTests = !!configStore.get(ExternalConfigSetting.ShowOnlyFocusedTests);
    this.showUnmappedTests = !!configStore.get(ExternalConfigSetting.ShowUnmappedTests);
    this.showTestDefinitionTypeIndicators = !!configStore.get(ExternalConfigSetting.ShowTestDefinitionTypeIndicators);
    this.debuggerConfigName = asNonBlankStringOrUndefined(configStore.get(ExternalConfigSetting.DebuggerConfigName));

    this.debuggerConfig = getMergedDebuggerConfig(
      normalizedWorkspacePath,
      configStore.get(ExternalConfigSetting.DebuggerConfig)!,
      configStore.get(ExternalConfigSetting.WebRoot),
      configStore.get(ExternalConfigSetting.PathMapping),
      configStore.get(ExternalConfigSetting.SourceMapPathOverrides)
    );

    this.userKarmaConfFilePath = normalizePath(
      resolve(this.projectRootPath, configStore.get(ExternalConfigSetting.KarmaConfFilePath))
    );

    this.reloadOnChangedFiles = (configStore.get<string[]>(ExternalConfigSetting.ReloadOnChangedFiles) || []).map(
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
      configStore.get(ExternalConfigSetting.ExcludeFiles),
      ALWAYS_EXCLUDED_TEST_FILE_GLOBS
    ).map(fileGlob => normalizePath(fileGlob));
  }

  public async dispose() {
    await Disposer.dispose(this.logger);
  }
}
