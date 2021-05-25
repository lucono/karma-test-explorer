import { KarmaConfigurator } from "./karma-configurator";
import { Config as KarmaConfig } from "karma";
import { USER_KARMA_CONFIG_PATH_ENV_VAR } from "../karma-constants";

const originalConfigPath = process.env[USER_KARMA_CONFIG_PATH_ENV_VAR] as string;
const karmaConfigurator = new KarmaConfigurator();

module.exports = (config: KarmaConfig) => {
  karmaConfigurator.loadOriginalUserConfiguration(config, originalConfigPath);
  karmaConfigurator.setMandatoryOptions(config);
  karmaConfigurator.cleanUpReporters(config);
  karmaConfigurator.dontLoadOriginalConfigurationFileIntoBrowser(config, originalConfigPath);
  karmaConfigurator.configureTestExplorerCustomReporter(config);
  karmaConfigurator.setBasePath(config, originalConfigPath);
  karmaConfigurator.disableSingleRunPermanently(config);
};
