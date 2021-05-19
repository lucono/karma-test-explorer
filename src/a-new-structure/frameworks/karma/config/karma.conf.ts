import { KarmaConfigurator } from "./karma-configurator";
import { Config as KarmaConfig } from "karma";

const originalConfigPath = process.env.userKarmaConfigPath as string;
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
