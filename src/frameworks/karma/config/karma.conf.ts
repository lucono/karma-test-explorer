import { Config as KarmaConfig } from 'karma';

import { ConsoleLogger } from '../../../util/logging/console-logger.js';
import { LogLevel } from '../../../util/logging/log-level.js';
import { Logger } from '../../../util/logging/logger.js';
import { KarmaEnvironmentVariable } from '../karma-environment-variable.js';
import { KarmaConfigLoader } from './karma-config-loader.js';

export default (config: KarmaConfig) => {
  const logLevel = (process.env[KarmaEnvironmentVariable.ExtensionLogLevel] as LogLevel) || LogLevel.INFO;
  const logger: Logger = new ConsoleLogger(KarmaConfigLoader.name, logLevel);

  const karmaConfigHomePath = process.env[KarmaEnvironmentVariable.ProjectKarmaConfigHomePath] as string;
  const originalConfigPath = process.env[KarmaEnvironmentVariable.ProjectKarmaConfigPath] as string;
  const karmaConfigLoader = new KarmaConfigLoader(logger);

  karmaConfigLoader.loadConfig(config, karmaConfigHomePath, originalConfigPath);
};
