import { Config as KarmaConfig, ConfigOptions as KarmaConfigOptions, CustomLauncher, InlinePluginDef } from 'karma';
import { dirname, resolve } from 'path';
import {
  CHROME_BROWSER_DEBUGGING_PORT_FLAG,
  KARMA_BROWSER_CAPTURE_MIN_TIMEOUT,
  KARMA_CUSTOM_LAUNCHER_BROWSER_NAME
} from '../../../constants';
import { KarmaEnvironmentVariable } from '../karma-environment-variable';
import { KarmaLogLevel } from '../karma-log-level';
import { KarmaTestExplorerReporter } from '../reporter/karma-test-explorer-reporter';

export class KarmaConfigurator {
  private readonly karmaPort: number;
  private readonly autoWatchEnabled: boolean;
  private readonly autoWatchBatchDelay: number | undefined;
  private readonly browser: string;
  private readonly customLauncher?: CustomLauncher;
  private readonly karmaLogLevel: KarmaLogLevel;

  public constructor() {
    this.karmaLogLevel = <KarmaLogLevel>process.env[KarmaEnvironmentVariable.KarmaLogLevel] ?? KarmaLogLevel.INFO;

    this.autoWatchEnabled =
      (process.env[KarmaEnvironmentVariable.AutoWatchEnabled] ?? 'false').toLowerCase() === 'true';

    this.karmaPort = parseInt(process.env[KarmaEnvironmentVariable.KarmaPort]!, 10);

    const debugPortString = process.env[KarmaEnvironmentVariable.DebugPort];
    const debugPort: number | undefined = debugPortString ? parseInt(debugPortString, 10) : undefined;

    const autoWatchBatchDelay = parseInt(process.env[KarmaEnvironmentVariable.AutoWatchBatchDelay]!, 10);
    this.autoWatchBatchDelay = !this.autoWatchEnabled
      ? 0
      : !Number.isNaN(autoWatchBatchDelay)
      ? autoWatchBatchDelay
      : undefined;

    const requestedBrowser = process.env[KarmaEnvironmentVariable.Browser];
    const customLauncherString = process.env[KarmaEnvironmentVariable.CustomLauncher]!;

    if (requestedBrowser) {
      this.browser = requestedBrowser;
      this.customLauncher = undefined;
    } else {
      this.browser = KARMA_CUSTOM_LAUNCHER_BROWSER_NAME;
      const customLaucher = JSON.parse(customLauncherString);
      this.addCustomLauncherDebugPort(customLaucher, debugPort);
      this.customLauncher = customLaucher;
    }
  }

  public applyConfigOverrides(config: KarmaConfig) {
    config.port = this.karmaPort;
    config.logLevel = (config as any)[`LOG_${this.karmaLogLevel.toUpperCase()}`];
    config.singleRun = false;
    config.autoWatch = this.autoWatchEnabled;
    config.autoWatchBatchDelay = this.autoWatchBatchDelay ?? config.autoWatchBatchDelay;
    config.restartOnFileChange = false;
    config.browsers = [this.browser];
    config.customLaunchers = this.customLauncher ? { [this.browser]: this.customLauncher } : config.customLaunchers;
    config.browserNoActivityTimeout = 1000 * 60 * 60 * 24;
    config.browserDisconnectTimeout = Math.max(config.browserDisconnectTimeout || 0, 30_000);
    config.pingTimeout = 1000 * 60 * 60 * 24;
    config.captureTimeout = Math.max(config.captureTimeout || 0, KARMA_BROWSER_CAPTURE_MIN_TIMEOUT);
    config.browserSocketTimeout = 30_000;
    config.processKillTimeout = 2000;
    config.retryLimit = Math.max(config.retryLimit || 0, 3);
    (config.client ??= {}).clearContext = false;
  }

  public loadOriginalKarmaConfig(config: KarmaConfig, originalKarmaConfigPath: string) {
    let originalKarmaConfigModule = require(originalKarmaConfigPath); // eslint-disable-line @typescript-eslint/no-var-requires

    // https://github.com/karma-runner/karma/blob/v1.7.0/lib/config.js#L364
    if (typeof originalKarmaConfigModule === 'object' && typeof originalKarmaConfigModule.default !== 'undefined') {
      originalKarmaConfigModule = originalKarmaConfigModule.default;
    }
    originalKarmaConfigModule(config);
  }

  public addOriginalKarmaConfigToExcludes(config: KarmaConfig, originalConfigPath: string) {
    (config.exclude ??= []).push(originalConfigPath);
  }

  public setBasePath(config: KarmaConfig, originalConfigPath: string) {
    if (!config.basePath) {
      if (originalConfigPath) {
        config.basePath = resolve(dirname(originalConfigPath));
      } else {
        config.basePath = process.cwd();
      }
    }
  }

  public disableSingleRun(config: KarmaConfig) {
    const originalConfigSet = config.set;

    if (typeof originalConfigSet !== 'function') {
      return;
    }
    config.set = (newConfig?: KarmaConfigOptions) => {
      if (newConfig) {
        newConfig.singleRun = newConfig.singleRun === true ? false : newConfig.singleRun;
        originalConfigSet.apply(config, [newConfig]);
      }
    };
  }

  public addReporter(config: KarmaConfig) {
    const reporterName = KarmaTestExplorerReporter.name;
    const karmaPlugin: InlinePluginDef = { [`reporter:${reporterName}`]: ['type', KarmaTestExplorerReporter] };

    (config.plugins ??= ['karma-*']).push(karmaPlugin);
    (config.reporters ??= []).splice(0, config.reporters.length, reporterName);
  }

  private addCustomLauncherDebugPort(customLaucher: CustomLauncher, debugPort: number | undefined) {
    if (!customLaucher || !debugPort) {
      return;
    }
    customLaucher.flags = customLaucher.flags?.map(flag =>
      flag.startsWith(CHROME_BROWSER_DEBUGGING_PORT_FLAG) ? `${CHROME_BROWSER_DEBUGGING_PORT_FLAG}=${debugPort}` : flag
    );
  }
}
