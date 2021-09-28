import { LogLevelName } from '../../util/logging/log-level';
import { Logger } from '../../util/logging/logger';

export type KarmaLogger = Omit<Logger, 'trace'>;

export type KarmaLogLevel = Exclude<LogLevelName, 'TRACE'>;
