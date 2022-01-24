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
  public readonly projectType?: ProjectType;
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
    this.environment = getCombinedEnvironment(this.projectRootPath, config, logger);
    this.projectType = config.get(ConfigSetting.ProjectType);
    this.testFramework = config.get(ConfigSetting.TestFramework);
    this.reloadOnKarmaConfigChange = !!config.get(ConfigSetting.ReloadOnKarmaConfigChange);
    this.defaultAngularProjectName = config.get(ConfigSetting.DefaultAngularProjectName)!;
    this.customLauncher = getCustomLauncher(config);
    this.browser = asNonBlankStringOrUndefined(config.get(ConfigSetting.Browser));
    this.testFiles = config.get<string[]>(ConfigSetting.TestFiles).map(fileGlob => normalizePath(fileGlob));
    this.allowGlobalPackageFallback = !!config.get(ConfigSetting.AllowGlobalPackageFallback);
    this.excludeDisabledTests = !!config.get(ConfigSetting.ExcludeDisabledTests);
    this.showOnlyFocusedTests = !!config.get(ConfigSetting.ShowOnlyFocusedTests);
    this.showUnmappedTests = !!config.get(ConfigSetting.ShowUnmappedTests);
    this.showTestDefinitionTypeIndicators = !!config.get(ConfigSetting.ShowTestDefinitionTypeIndicators);
    this.debuggerConfigName = asNonBlankStringOrUndefined(config.get(ConfigSetting.DebuggerConfigName));

    this.debuggerConfig = getMergedDebuggerConfig(
      normalizedWorkspacePath,
      config.get(ConfigSetting.DebuggerConfig)!,
      config.get(ConfigSetting.WebRoot),
      config.get(ConfigSetting.PathMapping),
      config.get(ConfigSetting.SourceMapPathOverrides)
    );

    this.userKarmaConfFilePath = normalizePath(
      resolve(this.projectRootPath, config.get(ConfigSetting.KarmaConfFilePath))
    );

    this.reloadOnChangedFiles = (config.get<string[]>(ConfigSetting.ReloadOnChangedFiles) || []).map(filePath =>
      normalizePath(resolve(this.projectRootPath, filePath))
    );

    this.defaultDebugPort = getDefaultDebugPort(
      this.browser,
      this.customLauncher,
      this.debuggerConfigName,
      this.debuggerConfig,
      config
    );

    this.excludeFiles = toSingleUniqueArray(
      config.get(ConfigSetting.ExcludeFiles),
      ALWAYS_EXCLUDED_TEST_FILE_GLOBS
    ).map(fileGlob => normalizePath(fileGlob));
  }

  public async dispose() {
    await Disposer.dispose(this.logger);
  }
}
