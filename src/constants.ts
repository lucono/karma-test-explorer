import { LogLevel } from './util/logging/log-level';

// Extension constants
export const EXTENSION_NAME = 'Karma Test Explorer';
export const EXTENSION_CONFIG_PREFIX = 'karmaTestExplorer';
export const EXTENSION_OUTPUT_CHANNEL_NAME = EXTENSION_NAME;
export const DEFAULT_LOG_LEVEL = LogLevel.DEBUG;
export const DEBUG_SESSION_START_TIMEOUT = 1000 * 15;
export const STATUS_BAR_MESASGE_MIN_DURATION = 1000 * 60;
export const STATUS_BAR_MESASGE_MAX_DURATION = 1000 * 60 * 15;
export const CONFIG_FILE_CHANGE_BATCH_DELAY = 1000 * 3;
export const WATCHED_FILE_CHANGE_BATCH_DELAY = 2500;

// Karma constants
export const KARMA_SERVER_OUTPUT_CHANNEL_NAME = 'Karma Server';
export const KARMA_CUSTOM_LAUNCHER_BROWSER_NAME = 'KarmaTestExplorer_CustomLauncher';
export const KARMA_BROWSER_CONTAINER_NO_SANDBOX_FLAG = '--no-sandbox';
export const KARMA_BROWSER_CONTAINER_HEADLESS_FLAGS = ['--headless', '--disable-gpu', '--disable-dev-shm-usage'];
export const KARMA_TEST_RUN_ID_FLAG = '--testRunId';
export const KARMA_SOCKET_PING_INTERVAL = 1000 * 60 * 60 * 24;
export const KARMA_SOCKET_PING_TIMEOUT = 1000 * 60 * 60 * 24;
export const KARMA_READY_DEFAULT_TIMEOUT = 1000 * 60 * 15;
export const KARMA_BROWSER_CAPTURE_MIN_TIMEOUT = 1000 * 90;
export const KARMA_TEST_EVENT_INTERVAL_TIMEOUT = 1000 * 60;

// Others
export const DEFAULT_KARMA_AND_ANGULAR_CONFIG_GLOBS = ['**/karma.conf.*', '**/angular.json', '**/.angular-cli.json'];
export const ALWAYS_EXCLUDED_TEST_FILE_GLOBS = ['**/node_modules/**/*'];
export const CHROME_BROWSER_DEBUGGING_PORT_FLAG = '--remote-debugging-port';
export const CHROME_DEFAULT_DEBUGGING_PORT = 9222;
export const DEFAULT_FILE_ENCODING: BufferEncoding = 'utf-8';
