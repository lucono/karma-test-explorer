import { Config as KarmaConfig } from 'karma';
import { ConsoleLogAppender } from '../../../util/logging/console-log-appender';
import { LogLevel } from '../../../util/logging/log-level';
import { Logger } from '../../../util/logging/logger';
import { SimpleLogger } from '../../../util/logging/simple-logger';
import { KarmaEnvironmentVariable } from '../karma-environment-variable';
import { KarmaConfigLoader } from './karma-config-loader';

module.exports = (config: KarmaConfig) => {
  const logLevel = <LogLevel>process.env[KarmaEnvironmentVariable.ExtensionLogLevel] || LogLevel.INFO;
  const logger: Logger = new SimpleLogger(new ConsoleLogAppender(), KarmaConfigLoader.name, logLevel);

  const originalConfigPath = process.env[KarmaEnvironmentVariable.ProjectKarmaConfigPath] as string;
  const karmaConfigProcessor = new KarmaConfigLoader(logger);

  karmaConfigProcessor.loadConfig(config, originalConfigPath);
};
