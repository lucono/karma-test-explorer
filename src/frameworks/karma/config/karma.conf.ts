import { Config as KarmaConfig } from 'karma';
import { KarmaEnvironmentVariable } from '../karma-environment-variable';
import { KarmaConfigurator } from './karma-configurator';

const originalConfigPath = process.env[KarmaEnvironmentVariable.ProjectKarmaConfigPath] as string;
const karmaConfigurator = new KarmaConfigurator();

module.exports = (config: KarmaConfig) => {
  karmaConfigurator.loadOriginalKarmaConfig(config, originalConfigPath);
  karmaConfigurator.applyConfigOverrides(config);
  karmaConfigurator.addOriginalKarmaConfigToExcludes(config, originalConfigPath);
  karmaConfigurator.addReporter(config);
  karmaConfigurator.setBasePath(config, originalConfigPath);
  karmaConfigurator.disableSingleRun(config);
};
