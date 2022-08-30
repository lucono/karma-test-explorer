import { Config as KarmaConfig } from 'karma';
import { ConsoleLogger } from '../../../util/logging/console-logger';
import { LogLevel } from '../../../util/logging/log-level';
import { Logger } from '../../../util/logging/logger';
import { KarmaEnvironmentVariable } from '../karma-environment-variable';
import { KarmaConfigLoader } from './karma-config-loader';

module.exports = (config: KarmaConfig) => {
  const logLevel = <LogLevel>process.env[KarmaEnvironmentVariable.ExtensionLogLevel] || LogLevel.INFO;
  const logger: Logger = new ConsoleLogger(KarmaConfigLoader.name, logLevel);

  const originalConfigPath = process.env[KarmaEnvironmentVariable.ProjectKarmaConfigPath] as string;
  const karmaConfigProcessor = new KarmaConfigLoader(logger);

  karmaConfigProcessor.loadConfig(config, originalConfigPath);
};
