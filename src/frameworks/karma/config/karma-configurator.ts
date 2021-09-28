import { Config as KarmaConfig, ConfigOptions as KarmaConfigOptions, CustomLauncher } from 'karma';
import { dirname, resolve } from 'path';
import { CHROME_BROWSER_DEBUGGING_PORT_FLAG, KARMA_CUSTOM_LAUNCHER_BROWSER_NAME } from '../../../constants';
import { KarmaEnvironmentVariable } from '../karma-environment-variable';
import { KarmaLogLevel } from '../karma-logger';
import { instance as customReporterInstance, name as customReporterName } from '../runner/karma-test-explorer-reporter';

export class KarmaConfigurator {
  private readonly karmaPort: number;
  private readonly autoWatchEnabled: boolean;
  private readonly autoWatchBatchDelay: number;
  private readonly browser: string;
  private readonly customLauncher?: CustomLauncher;
  private readonly karmaLogLevel: KarmaLogLevel;

  public constructor() {
    this.karmaLogLevel = (process.env[KarmaEnvironmentVariable.KarmaLogLevel]! as KarmaLogLevel) ?? 'INFO';

    this.autoWatchEnabled =
      (process.env[KarmaEnvironmentVariable.AutoWatchEnabled] ?? 'false').toLocaleLowerCase() === 'true';

    this.karmaPort = parseInt(process.env[KarmaEnvironmentVariable.KarmaPort]!, 10);

    const debugPortString = process.env[KarmaEnvironmentVariable.DebugPort];
    const debugPort: number | undefined = debugPortString ? parseInt(debugPortString, 10) : undefined;

    const autoWatchBatchDelay = parseInt(process.env[KarmaEnvironmentVariable.AutoWatchBatchDelay]!, 10);
    this.autoWatchBatchDelay = !this.autoWatchEnabled ? 0 : autoWatchBatchDelay;

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

  private addCustomLauncherDebugPort(customLaucher: CustomLauncher, debugPort: number | undefined) {
    if (!customLaucher || !debugPort) {
      return;
    }
    customLaucher.flags = customLaucher.flags?.map(flag =>
      flag.startsWith(CHROME_BROWSER_DEBUGGING_PORT_FLAG) ? `${CHROME_BROWSER_DEBUGGING_PORT_FLAG}=${debugPort}` : flag
    );
  }

  public setMandatoryOptions(config: KarmaConfig) {
    config.port = this.karmaPort;
    config.logLevel = (config as any)[`LOG_${this.karmaLogLevel.toUpperCase()}`] ?? config.LOG_INFO;
    config.singleRun = false;
    config.autoWatch = this.autoWatchEnabled;
    config.autoWatchBatchDelay = this.autoWatchBatchDelay;
    config.restartOnFileChange = false;
    config.browsers = [this.browser];

    if (this.customLauncher) {
      config.customLaunchers = { [this.browser]: this.customLauncher };
    }

    config.browserNoActivityTimeout = 1_000 * 60 * 60 * 24;
    config.browserDisconnectTimeout = 30_000;
    config.pingTimeout = 1_000 * 60 * 60 * 24;
    config.captureTimeout = 60_000;
    config.browserSocketTimeout = 30_000;
    config.processKillTimeout = 2_000;
    config.retryLimit = 3;

    config.client ??= {};
    config.client.clearContext = true;
  }

  public dontLoadOriginalConfigurationFileIntoBrowser(config: KarmaConfig, originalConfigPath: string) {
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

  public disableSingleRunPermanently(config: KarmaConfig) {
    const prevSet = config.set;
    if (typeof prevSet === 'function') {
      config.set = (newConfig: KarmaConfigOptions) => {
        if (newConfig != null) {
          if (newConfig.singleRun === true) {
            newConfig.singleRun = false;
          }
          prevSet(newConfig);
        }
      };
    }
  }

  public cleanUpReporters(config: KarmaConfig) {
    const filteredReporters = this.removeElementsFromArrayWithoutModifyingIt(config.reporters, ['dots', 'kjhtml']);
    config.reporters = filteredReporters;
  }

  public loadOriginalUserConfiguration(config: KarmaConfig, originalConfigPath: string) {
    let originalConfigModule = require(originalConfigPath); // eslint-disable-line @typescript-eslint/no-var-requires
    // https://github.com/karma-runner/karma/blob/v1.7.0/lib/config.js#L364
    if (typeof originalConfigModule === 'object' && typeof originalConfigModule.default !== 'undefined') {
      originalConfigModule = originalConfigModule.default;
    }

    originalConfigModule(config);
  }

  public configureTestExplorerCustomReporter(config: KarmaConfig) {
    this.addPlugin(config, { [`reporter:${customReporterName}`]: ['type', customReporterInstance] });
    (config.reporters ??= []).push(customReporterName);
  }

  private addPlugin(karmaConfig: KarmaConfigOptions, karmaPlugin: any) {
    (karmaConfig.plugins ??= ['karma-*']).push(karmaPlugin);
  }

  private removeElementsFromArrayWithoutModifyingIt(elements?: any[], elementsToRemove?: any[] | any) {
    if (elements === undefined) {
      return [];
    }

    if (Array.isArray(elementsToRemove)) {
      return elements.filter(element =>
        typeof element === 'object'
          ? !elementsToRemove.some(x => Object.keys(element)[0] in x)
          : elementsToRemove.indexOf(element) < 0
      );
    } else {
      return elements.filter(element => element !== elementsToRemove);
    }
  }
}
