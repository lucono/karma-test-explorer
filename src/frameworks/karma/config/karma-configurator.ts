import { Config as KarmaConfig, ConfigOptions as KarmaConfigOptions, CustomLauncher } from "karma";
import { instance as customReporterInstance, name as customReporterName } from "../../jasmine/jasmine-reporter";
import { dirname, resolve } from "path";
import { KarmaEnvironmentVariable } from "../karma-environment-variable";

const DEFAULT_AUTO_WATCH_BATCH_DELAY = 2_500;  // FIXME: Read from config
const CUSTOM_LAUNCHER_BROWSER_NAME = "KarmaTestExplorer_ChromeHeadless";

const defaultCustomLauncherConfig: CustomLauncher = {
  "base": "ChromeHeadless",
  "debug": true,
  "flags": [
    "--remote-debugging-port=9222"
  ]
};

export class KarmaConfigurator {
  private readonly karmaPort: number;
  private readonly autoWatchEnabled: boolean;
  private readonly autoWatchBatchDelay: number;
  private readonly browser: string;
  private readonly customLauncher?: CustomLauncher;

  constructor() {
    this.karmaPort = parseInt(process.env[KarmaEnvironmentVariable.KarmaPort]!, 10);
    this.autoWatchEnabled = (process.env[KarmaEnvironmentVariable.AutoWatchEnabled] ?? 'false').toLocaleLowerCase() === 'true';
    const autoWatchBatchDelay = parseInt(process.env[KarmaEnvironmentVariable.AutoWatchBatchDelay]!, 10);
    
    this.autoWatchBatchDelay = !this.autoWatchEnabled ? 0
      : autoWatchBatchDelay >= 0 ? autoWatchBatchDelay
      : DEFAULT_AUTO_WATCH_BATCH_DELAY;

    const requestedBrowser = process.env[KarmaEnvironmentVariable.Browser];
    const customLauncherString = process.env[KarmaEnvironmentVariable.CustomLauncher];
    // this.browser = requestedBrowser ?? CUSTOM_LAUNCHER_BROWSER_NAME;

    // const customLauncherString = process.env[KarmaEnvironmentVariable.CustomLauncher];

    // this.customLauncher = requestedBrowser ? undefined
    //   : customLauncherString ? JSON.parse(customLauncherString)
    //   : defaultCustomLauncherConfig;

    if (requestedBrowser) {
      this.browser = requestedBrowser;
      this.customLauncher = undefined;

    } else {
      this.browser = CUSTOM_LAUNCHER_BROWSER_NAME;

      this.customLauncher = customLauncherString
        ? JSON.parse(customLauncherString)
        : defaultCustomLauncherConfig;
    }
  }

  public setMandatoryOptions(config:  KarmaConfig) {
    // remove 'logLevel' changing
    // https://github.com/karma-runner/karma/issues/614 is ready

    config.port = this.karmaPort; // FIXME Use shared constants for all environment variable exchange
    config.logLevel = config.LOG_INFO;
    
    config.singleRun = false;
    config.autoWatch = this.autoWatchEnabled;
    config.autoWatchBatchDelay = this.autoWatchBatchDelay;
    config.restartOnFileChange = false;  // FIXME: Validate this is preferable
    config.browserNoActivityTimeout = undefined;

    config.client ??= {};
    config.client.clearContext = true;

    config.browsers = [ this.browser ];

    config.customLaunchers = this.customLauncher
      ? { [this.browser]: this.customLauncher }
      : config.customLaunchers;
  }

  public dontLoadOriginalConfigurationFileIntoBrowser(config:  KarmaConfig, originalConfigPath: string) {
    // https://github.com/karma-runner/karma-intellij/issues/9
    config.exclude = config.exclude || [];
    config.exclude.push(originalConfigPath);
  }

  public setBasePath(config:  KarmaConfig, originalConfigPath: string) {
    if (!config.basePath) {
      // We need to set the base path, so karma won't use this file to base everything of
      if (originalConfigPath) {
        config.basePath = resolve(dirname(originalConfigPath));
      } else {
        config.basePath = process.cwd();
      }
    }
  }

  public disableSingleRunPermanently(config:  KarmaConfig) {
    const prevSet = config.set;
    if (typeof prevSet === "function") {
      config.set = (newConfig:  KarmaConfigOptions) => {
        if (newConfig != null) {
          if (newConfig.singleRun === true) {
            newConfig.singleRun = false;
          }
          prevSet(newConfig);
        }
      };
    }
  }

  public cleanUpReporters(config:  KarmaConfig) {
    const filteredReporters = this.removeElementsFromArrayWithoutModifyingIt(config.reporters, ["dots", "kjhtml"]);
    config.reporters = filteredReporters;
  }

  public loadOriginalUserConfiguration(config:  KarmaConfig, originalConfigPath: string) {
    let originalConfigModule = require(originalConfigPath);
    // https://github.com/karma-runner/karma/blob/v1.7.0/lib/config.js#L364
    if (typeof originalConfigModule === "object" && typeof originalConfigModule.default !== "undefined") {
      originalConfigModule = originalConfigModule.default;
    }

    originalConfigModule(config);
  }

  public configureTestExplorerCustomReporter(config:  KarmaConfig) {
    this.addPlugin(config, { [`reporter:${customReporterName}`]: ["type", customReporterInstance] });
    (config.reporters ??= []).push(customReporterName);
  }

  private addPlugin(karmaConfig:  KarmaConfigOptions, karmaPlugin: any) {
    (karmaConfig.plugins ??= ["karma-*"]).push(karmaPlugin);
  }

  private removeElementsFromArrayWithoutModifyingIt(elements?: any[], elementsToRemove?: any[] | any) {
    if (elements === undefined) {
      return [];
    }

    if (Array.isArray(elementsToRemove)) {
      return elements.filter(element => typeof element === "object"
        ? !elementsToRemove.some(x => Object.keys(element)[0] in x)
        : elementsToRemove.indexOf(element) < 0);
        
    } else {
      return elements.filter(element => element !== elementsToRemove);
    }
  }
}
