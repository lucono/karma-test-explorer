import { Config as KarmaConfig, ConfigOptions as KarmaConfigOptions } from "karma";
import { dirname, resolve } from "path";
import * as TestExplorerCustomReporter from "../core/integration/test-explorer-custom-karma-reporter";
import { UtilityHelper } from "../core/helpers/utility-helper";

const CHROME_CUSTOM_LAUNCHER = "ChromeTestExplorer";

export class KarmaConfigurator {
  private readonly testExplorerHelper: UtilityHelper;
  constructor() {
    this.testExplorerHelper = new UtilityHelper();
  }

  public setMandatoryOptions(config:  KarmaConfig) {
    // remove 'logLevel' changing
    // https://github.com/karma-runner/karma/issues/614 is ready

    config.port = parseInt(process.env.karmaPort!, 10); // FIXME Use shared constants for all environment variable exchange
    config.logLevel = config.LOG_INFO;
    config.autoWatch = false;
    config.autoWatchBatchDelay = 0;
    (config.client ??= {}).clearContext = true;
    config.browsers = [ CHROME_CUSTOM_LAUNCHER ];
    config.browserNoActivityTimeout = undefined;
    config.singleRun = false;
    config.customLaunchers = {
      [ CHROME_CUSTOM_LAUNCHER ]: {
        base: "ChromeHeadless",
        debug: true,
        flags: [
          "--remote-debugging-port=9222"
        ],
      },
    };
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
    const filteredReporters = this.testExplorerHelper.removeElementsFromArrayWithoutModifyingIt(config.reporters, ["dots", "kjhtml"]);
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
    this.addPlugin(config, { [`reporter:${TestExplorerCustomReporter.name}`]: ["type", TestExplorerCustomReporter.instance] });
    if (!config.reporters) {
      config.reporters = [];
    }
    config.reporters.push(TestExplorerCustomReporter.name);
  }

  private addPlugin(karmaConfig:  KarmaConfigOptions, karmaPlugin: any) {
    karmaConfig.plugins = karmaConfig.plugins || ["karma-*"];
    karmaConfig.plugins.push(karmaPlugin);
  }
}
