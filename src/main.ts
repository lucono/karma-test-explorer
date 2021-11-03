import globby from 'globby';
import { ExtensionContext, extensions, workspace, WorkspaceFolder } from 'vscode';
import { testExplorerExtensionId, TestHub } from 'vscode-test-adapter-api';
import { Adapter } from './adapter';
import {
  ALWAYS_EXCLUDED_TEST_FILE_GLOBS,
  DEFAULT_KARMA_AND_ANGULAR_CONFIG_GLOBS,
  EXTENSION_CONFIG_PREFIX,
  EXTENSION_OUTPUT_CHANNEL_NAME
} from './constants';
import { ConfigSetting } from './core/config/config-setting';
import { OutputChannelLog } from './core/vscode/output-channel-log';
import { Disposer } from './util/disposable/disposer';
import { LogLevel } from './util/logging/log-level';
import { Logger } from './util/logging/logger';
import { SimpleLogger } from './util/logging/simple-logger';
import { normalizePath } from './util/utils';

const registeredAdapters = new Map();

export const activate = async (context: ExtensionContext) => {
  const outputChannelLog = new OutputChannelLog(EXTENSION_OUTPUT_CHANNEL_NAME);
  const logger: Logger = new SimpleLogger(outputChannelLog, 'Main', LogLevel.INFO);
  const testExplorerExtension = extensions.getExtension<TestHub>(testExplorerExtensionId);

  if (!testExplorerExtension) {
    const errorMsg = 'ERROR: Could not find Test Explorer UI extension';
    logger.error(() => errorMsg);
    throw new Error(errorMsg);
  }
  const testHub = testExplorerExtension.exports;
  const workspaceFolders = workspace.workspaceFolders;

  workspaceFolders?.forEach(workspaceFolder => addAdapterForFolder(workspaceFolder, testHub, logger, outputChannelLog));

  const workspaceFolderChangeSubscription = workspace.onDidChangeWorkspaceFolders(folderChangeEvent => {
    folderChangeEvent.added.forEach(addedFolder => addAdapterForFolder(addedFolder, testHub, logger, outputChannelLog));
    folderChangeEvent.removed.forEach(removedFolder => removeAdapterForFolder(removedFolder, testHub, logger));
  });

  context.subscriptions.push(workspaceFolderChangeSubscription, outputChannelLog);
};

export const deactivate = async () => {
  const disposables = Array.from(registeredAdapters.values());
  await Disposer.dispose(disposables);
};

const addAdapterForFolder = (
  workspaceFolder: WorkspaceFolder,
  testHub: TestHub,
  logger: Logger,
  outputLog: OutputChannelLog
): void => {
  if (workspaceFolder.uri.scheme !== 'file' || !shouldActivateAdapterForWorkspaceFolder(workspaceFolder, logger)) {
    return;
  }
  logger.info(() => `Activating new adapter for workspace folder: ${normalizePath(workspaceFolder.uri.fsPath)}`);
  const adapter = new Adapter(workspaceFolder, outputLog);
  registeredAdapters.set(workspaceFolder, adapter);
  testHub.registerTestAdapter(adapter);
  logger.info(() => `Done activating adapter for workspace folder: ${normalizePath(workspaceFolder.uri.fsPath)}`);
};

const removeAdapterForFolder = (workspaceFolder: WorkspaceFolder, testHub: TestHub, logger: Logger): void => {
  const adapter = registeredAdapters.get(workspaceFolder);

  if (adapter) {
    logger.info(() => `Deactivating adapter for workspace folder: ${normalizePath(workspaceFolder.uri.fsPath)}`);
    testHub.unregisterTestAdapter(adapter);
    registeredAdapters.delete(workspaceFolder);
    adapter.dispose();
    logger.info(() => `Done deactivating adapter for workspace folder: ${normalizePath(workspaceFolder.uri.fsPath)}`);
  }
};

const shouldActivateAdapterForWorkspaceFolder = (workspaceFolder: WorkspaceFolder, logger: Logger): boolean => {
  const workspaceFolderPath = normalizePath(workspaceFolder.uri.fsPath);

  const workspaceKarmaOrAngularConfigFiles = globby.sync(DEFAULT_KARMA_AND_ANGULAR_CONFIG_GLOBS, {
    ignore: ALWAYS_EXCLUDED_TEST_FILE_GLOBS,
    cwd: workspaceFolderPath
  });
  const config = workspace.getConfiguration(EXTENSION_CONFIG_PREFIX, workspaceFolder.uri);
  const configuredExtensionSetting = Object.values(ConfigSetting).find(configSetting => config.has(configSetting));
  const hasKarmaOrAngularConfigFile = workspaceKarmaOrAngularConfigFiles.length > 0;

  if (hasKarmaOrAngularConfigFile) {
    logger.debug(
      () =>
        `Activating adapter for workspace folder '${workspaceFolderPath}' because ` +
        `it has relevant project config file: ${workspaceKarmaOrAngularConfigFiles[0]}`
    );
  } else if (configuredExtensionSetting !== undefined) {
    logger.debug(
      () =>
        `Activating adapter for workspace folder '${workspaceFolderPath}' because ` +
        `it has the extension setting configured: ${configuredExtensionSetting}`
    );
  }
  return hasKarmaOrAngularConfigFile || !!configuredExtensionSetting;
};
