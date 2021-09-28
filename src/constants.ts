import { LogLevel } from './util/logging/log-level';

// Extension constants
export const EXTENSION_NAME = 'Karma Test Explorer';
export const EXTENSION_CONFIG_PREFIX = 'karmaTestExplorer';
export const EXTENSION_OUTPUT_CHANNEL_NAME = EXTENSION_NAME;
export const DEFAULT_LOG_LEVEL = LogLevel.DEBUG;
export const DEBUG_SESSION_START_TIMEOUT = 15_000;
export const STATUS_BAR_MESASGE_MAX_DURATION = 60_000;

// Karma constants
export const KARMA_SERVER_OUTPUT_CHANNEL_NAME = 'Karma Server';
export const KARMA_CUSTOM_LAUNCHER_BROWSER_NAME = 'KarmaTestExplorer_CustomLauncher';
export const KARMA_BROWSER_CONTAINER_NO_SANDBOX_FLAG = '--no-sandbox';
export const KARMA_SOCKET_PING_INTERVAL = 24 * 60 * 60 * 1000;
export const KARMA_SOCKET_PING_TIMEOUT = 24 * 60 * 60 * 1000;
export const KARMA_READY_DEFAULT_TIMEOUT = 1000 * 60 * 15;

// Others
export const CHROME_BROWSER_DEBUGGING_PORT_FLAG = '--remote-debugging-port';
export const CHROME_DEFAULT_DEBUGGING_PORT = 9222;
export const DEFAULT_FILE_ENCODING: BufferEncoding = 'utf-8';
export const FILE_URI_SCHEME = 'file';
