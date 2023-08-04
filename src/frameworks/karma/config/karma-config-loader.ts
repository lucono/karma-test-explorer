import { CustomLauncher, InlinePluginDef, Config as KarmaConfig } from 'karma';
import { resolve } from 'path';

import { KARMA_BROWSER_CAPTURE_MIN_TIMEOUT, KARMA_CUSTOM_LAUNCHER_BROWSER_NAME } from '../../../constants.js';
import { BrowserHelperFactory } from '../../../core/config/browsers/browser-factory.js';
import { Logger } from '../../../util/logging/logger.js';
import { asNonBlankStringOrUndefined } from '../../../util/utils.js';
import { KarmaEnvironmentVariable } from '../karma-environment-variable.js';
import { KarmaLogLevel } from '../karma-log-level.js';
import { KarmaTestExplorerReporter } from '../reporter/karma-test-explorer-reporter.js';
import loadDefaultKarmaConfig from './karma.conf-default.js';

export class KarmaConfigLoader {
  public constructor(private readonly logger: Logger) {}

  public loadConfig(config: KarmaConfig, karmaConfigHomePath: string, karmaConfigPath?: string) {
    this.loadOriginalConfig(config, karmaConfigHomePath, karmaConfigPath);
    this.applyConfigOverrides(config, karmaConfigHomePath, karmaConfigPath);
    this.addKarmaTestExplorerReporter(config);
  }

  private loadOriginalConfig(config: KarmaConfig, karmaConfigHomePath: string, originalKarmaConfigPath?: string) {
    if (!originalKarmaConfigPath) {
      this.logger.debug(() => `No Karma config file specified - Using default configuration`);
      loadDefaultKarmaConfig(config, { karmaConfigHomePath });
      return;
    }
    this.logger.debug(() => `Loading Karma config: ${originalKarmaConfigPath}`);
    let originalKarmaConfigModule = require(originalKarmaConfigPath); // eslint-disable-line @typescript-eslint/no-var-requires

    // https://github.com/karma-runner/karma/blob/v1.7.0/lib/config.js#L364
    if (typeof originalKarmaConfigModule === 'object' && typeof originalKarmaConfigModule.default !== 'undefined') {
      originalKarmaConfigModule = originalKarmaConfigModule.default;
    }
    originalKarmaConfigModule(config);
  }

  private applyConfigOverrides(config: KarmaConfig, karmaConfigHomePath: string, karmaConfigPath?: string) {
    // -- Karma Port and LogLevel settings --
    const karmaLogLevel = (process.env[KarmaEnvironmentVariable.KarmaLogLevel] as KarmaLogLevel) ?? KarmaLogLevel.INFO;
    const karmaPort = parseInt(process.env[KarmaEnvironmentVariable.KarmaPort]!, 10);

    // -- Autowatch settings --
    const autoWatchEnabled =
      (process.env[KarmaEnvironmentVariable.AutoWatchEnabled] ?? 'false').toLowerCase() === 'true';

    const configuredAutoWatchBatchDelay = parseInt(process.env[KarmaEnvironmentVariable.AutoWatchBatchDelay]!, 10);
    const autoWatchBatchDelay = !autoWatchEnabled
      ? 0
      : !Number.isNaN(configuredAutoWatchBatchDelay)
      ? configuredAutoWatchBatchDelay
      : config.autoWatchBatchDelay;

    // -- Browser and Custom Launcher settings --
    const requestedBrowser = process.env[KarmaEnvironmentVariable.Browser];

    let browser: string;
    let customLauncher: CustomLauncher | undefined;
    const userSpecifiedLaunchConfig = process.env[KarmaEnvironmentVariable.UserSpecifiedLaunchConfig] === 'true';

    if (requestedBrowser) {
      this.logger.debug(() => `Using requested karma browser: ${requestedBrowser}`);
      browser = requestedBrowser;
      customLauncher = undefined;
    } else {
      const debugPortString = process.env[KarmaEnvironmentVariable.DebugPort];
      const debugPort: number | undefined = debugPortString ? parseInt(debugPortString, 10) : undefined;
      this.logger.debug(() => `Using debug port: ${debugPort}`);

      const customLauncherString = process.env[KarmaEnvironmentVariable.CustomLauncher]!;
      let customLaucherObject = customLauncherString ? JSON.parse(customLauncherString) : {};

      const browserHelper = BrowserHelperFactory.getBrowserHelper(customLaucherObject?.base ?? '');

      if (!userSpecifiedLaunchConfig) {
        customLaucherObject = this.findMatchingCustomLauncherFromConfig(customLaucherObject, config);
      }

      customLaucherObject = browserHelper.addCustomLauncherDebugPort(customLaucherObject, debugPort);

      this.logger.debug(() => `Using custom launcher: ${JSON.stringify(customLaucherObject, null, 2)}`);
      browser = KARMA_CUSTOM_LAUNCHER_BROWSER_NAME;
      customLauncher = customLaucherObject;
    }

    const configuredRelativeBasePath = asNonBlankStringOrUndefined(config.basePath) ?? '';
    const absoluteBasePath = resolve(karmaConfigHomePath, configuredRelativeBasePath);

    // -- Update Karma config --
    config.basePath = absoluteBasePath;
    config.port = karmaPort;
    config.logLevel = (config as any)[`LOG_${karmaLogLevel.toUpperCase()}`];
    config.singleRun = false;
    config.autoWatch = autoWatchEnabled;
    config.autoWatchBatchDelay = autoWatchBatchDelay;
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
    (config.client ??= {}).clearContext = false;

    if (karmaConfigPath) {
      (config.exclude ??= []).push(karmaConfigPath);
    }

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

  /**
   * Tries to find a custom launcher configuration from the user's karma config file that matches the browser type found during extension configuration
   * Will return the extension configuration if no custom launcher configuration could be found
   * @param customLaucherObject - The custom launcher object generated by the extension config
   * @param config - The Karma config object returned by the user's karma config file
   * @returns A matching custom launcher from the user's config, or the one generated by the extension
   */
  private findMatchingCustomLauncherFromConfig(customLaucherObject: CustomLauncher, config: KarmaConfig) {
    const customLaunchers = config.customLaunchers ?? {};
    for (const browser of config.browsers ?? []) {
      if (browser === customLaucherObject.base) {
        break;
      }

      if (browser in customLaunchers && customLaunchers[browser].base === customLaucherObject.base) {
        return customLaunchers[browser];
      }
    }

    return customLaucherObject;
  }
}
