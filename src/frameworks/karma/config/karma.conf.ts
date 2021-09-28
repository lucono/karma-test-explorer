import { Config as KarmaConfig } from 'karma';
import { KarmaEnvironmentVariable } from '../karma-environment-variable';
import { KarmaConfigurator } from './karma-configurator';

const originalConfigPath = process.env[KarmaEnvironmentVariable.UserKarmaConfigPath] as string;
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
