import { Config as KarmaConfig, CustomLauncher, InlinePluginDef } from 'karma';
import { dirname, resolve } from 'path';
import {
  CHROME_BROWSER_DEBUGGING_PORT_FLAG,
  KARMA_BROWSER_CAPTURE_MIN_TIMEOUT,
  KARMA_CUSTOM_LAUNCHER_BROWSER_NAME
} from '../../../constants';
import { Logger } from '../../../util/logging/logger';
import { KarmaEnvironmentVariable } from '../karma-environment-variable';
import { KarmaLogLevel } from '../karma-log-level';
import { KarmaTestExplorerReporter } from '../reporter/karma-test-explorer-reporter';

export class KarmaConfigLoader {
  public constructor(private readonly logger: Logger) {}

  public loadConfig(config: KarmaConfig, originalConfigPath: string) {
    this.loadOriginalConfig(config, originalConfigPath);
    this.applyConfigOverrides(config, originalConfigPath);
    this.addKarmaTestExplorerReporter(config);
  }

  private loadOriginalConfig(config: KarmaConfig, originalKarmaConfigPath: string) {
    let originalKarmaConfigModule = require(originalKarmaConfigPath); // eslint-disable-line @typescript-eslint/no-var-requires

    // https://github.com/karma-runner/karma/blob/v1.7.0/lib/config.js#L364
    if (typeof originalKarmaConfigModule === 'object' && typeof originalKarmaConfigModule.default !== 'undefined') {
      originalKarmaConfigModule = originalKarmaConfigModule.default;
    }
    originalKarmaConfigModule(config);
  }

  private applyConfigOverrides(config: KarmaConfig, originalConfigPath: string) {
    // -- Karma Port and LogLevel settings --
    const karmaLogLevel = <KarmaLogLevel>process.env[KarmaEnvironmentVariable.KarmaLogLevel] ?? KarmaLogLevel.INFO;
    const karmaPort = parseInt(process.env[KarmaEnvironmentVariable.KarmaPort]!, 10);

    // -- Autowatch settings --
    const autoWatchEnabled =
      (process.env[KarmaEnvironmentVariable.AutoWatchEnabled] ?? 'false').toLowerCase() === 'true';

    const configuredAutoWatchBatchDelay = parseInt(process.env[KarmaEnvironmentVariable.AutoWatchBatchDelay]!, 10);
    const autoWatchBatchDelay = !autoWatchEnabled
      ? 0
      : !Number.isNaN(configuredAutoWatchBatchDelay)
      ? configuredAutoWatchBatchDelay
      : undefined;

    // -- Browser and Custom Launcher settings --
    const requestedBrowser = process.env[KarmaEnvironmentVariable.Browser];

    let browser: string;
    let customLauncher: CustomLauncher | undefined;

    if (requestedBrowser) {
      this.logger.debug(() => `Using requested karma browser: ${requestedBrowser}`);
      browser = requestedBrowser;
      customLauncher = undefined;
    } else {
      const debugPortString = process.env[KarmaEnvironmentVariable.DebugPort];
      const debugPort: number | undefined = debugPortString ? parseInt(debugPortString, 10) : undefined;

      const customLauncherString = process.env[KarmaEnvironmentVariable.CustomLauncher]!;
      const customLaucherObject = customLauncherString ? JSON.parse(customLauncherString) : {};
      this.addCustomLauncherDebugPort(customLaucherObject, debugPort);

      this.logger.debug(() => `Using custom launcher: ${JSON.stringify(customLaucherObject, null, 2)}`);
      browser = KARMA_CUSTOM_LAUNCHER_BROWSER_NAME;
      customLauncher = customLaucherObject;
    }

    // -- Update Karma config --
    config.port = karmaPort;
    config.logLevel = (config as any)[`LOG_${karmaLogLevel.toUpperCase()}`];
    config.singleRun = false;
    config.autoWatch = autoWatchEnabled;
    config.autoWatchBatchDelay = autoWatchBatchDelay ?? config.autoWatchBatchDelay;
    config.restartOnFileChange = false;
    config.browsers = [browser];
    config.customLaunchers = customLauncher ? { [browser]: customLauncher } : config.customLaunchers;
    config.browserNoActivityTimeout = 1000 * 60 * 60 * 24;
    config.browserDisconnectTimeout = Math.max(config.browserDisconnectTimeout || 0, 30_000);
    config.pingTimeout = 1000 * 60 * 60 * 24;
    config.captureTimeout = Math.max(config.captureTimeout || 0, KARMA_BROWSER_CAPTURE_MIN_TIMEOUT);
    config.browserSocketTimeout = 30_000;
    config.processKillTimeout = 2000;
    config.retryLimit = Math.max(config.retryLimit || 0, 3);
    config.basePath ??= originalConfigPath ? resolve(dirname(originalConfigPath)) : process.cwd();
    (config.exclude ??= []).push(originalConfigPath);
    (config.client ??= {}).clearContext = false;

    // -- Permanently disable Single Run --
    const configSetter = typeof config.set === 'function' ? config.set : undefined;

    config.set = configSetter
      ? (newConfig = {}) => configSetter.apply(config, [{ ...newConfig, singleRun: false }])
      : config.set;
  }

  private addKarmaTestExplorerReporter(config: KarmaConfig) {
    const reporterName = KarmaTestExplorerReporter.name;
    const karmaPlugin: InlinePluginDef = { [`reporter:${reporterName}`]: ['type', KarmaTestExplorerReporter] };

    const plugins = Array.isArray(config.plugins) ? config.plugins : ['karma-*'];
    plugins.push(karmaPlugin);
    config.plugins = plugins;

    const reporters = Array.isArray(config.reporters) ? config.reporters : [];
    reporters.splice(0, reporters.length, reporterName);
    config.reporters = reporters;
  }

  private addCustomLauncherDebugPort(customLaucher: CustomLauncher, debugPort: number | undefined) {
    if (!customLaucher || debugPort === undefined) {
      return;
    }
    customLaucher.flags = customLaucher.flags?.map(flag =>
      flag.startsWith(CHROME_BROWSER_DEBUGGING_PORT_FLAG) ? `${CHROME_BROWSER_DEBUGGING_PORT_FLAG}=${debugPort}` : flag
    );
  }
}
