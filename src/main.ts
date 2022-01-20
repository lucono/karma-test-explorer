import { existsSync } from 'fs';
import { posix } from 'path';
import { ExtensionContext, extensions, workspace, WorkspaceConfiguration, WorkspaceFolder } from 'vscode';
import { testExplorerExtensionId, TestHub } from 'vscode-test-adapter-api';
import { Adapter } from './adapter';
import { EXTENSION_CONFIG_PREFIX, EXTENSION_NAME, EXTENSION_OUTPUT_CHANNEL_NAME } from './constants';
import { ConfigSetting } from './core/config/config-setting';
import { OutputChannelLog } from './core/vscode/output-channel-log';
import { Disposer } from './util/disposable/disposer';
import { LogLevel } from './util/logging/log-level';
import { Logger } from './util/logging/logger';
import { SimpleLogger } from './util/logging/simple-logger';
import { normalizePath } from './util/utils';

const registeredAdapters = new Map();

export const activate = async (context: ExtensionContext) => {
  const channelLog = new OutputChannelLog(EXTENSION_OUTPUT_CHANNEL_NAME);
  const logger: Logger = new SimpleLogger(channelLog, 'Main', LogLevel.INFO);
  const testExplorerExtension = extensions.getExtension<TestHub>(testExplorerExtensionId);

  if (!testExplorerExtension) {
    const errorMsg = 'ERROR: Could not find Test Explorer UI extension';
    logger.error(() => errorMsg);
    throw new Error(errorMsg);
  }
  const testHub = testExplorerExtension.exports;
  const workspaceFolders = workspace.workspaceFolders;

  workspaceFolders?.forEach(workspaceFolder => addAdapterForFolder(workspaceFolder, testHub, channelLog));

  const workspaceFolderChangeSubscription = workspace.onDidChangeWorkspaceFolders(folderChangeEvent => {
    folderChangeEvent.added.forEach(addedFolder => addAdapterForFolder(addedFolder, testHub, channelLog));
    folderChangeEvent.removed.forEach(removedFolder => removeAdapterForFolder(removedFolder, testHub, channelLog));
  });

  context.subscriptions.push(workspaceFolderChangeSubscription, channelLog);
};

export const deactivate = async () => {
  const disposables = Array.from(registeredAdapters.values());
  await Disposer.dispose(disposables);
};

const addAdapterForFolder = (
  workspaceFolder: WorkspaceFolder,
  testHub: TestHub,
  channelLog: OutputChannelLog
): void => {
  const workspaceFolderPath = normalizePath(workspaceFolder.uri.fsPath);
  const config = workspace.getConfiguration(EXTENSION_CONFIG_PREFIX, workspaceFolder.uri);
  const logLevel: LogLevel = config.get<LogLevel>(ConfigSetting.LogLevel, LogLevel.INFO);
  const logger: Logger = new SimpleLogger(channelLog, 'Main', logLevel);
  const shouldActivateAdapter = shouldActivateAdapterForWorkspaceFolder(workspaceFolderPath, config, logger);

  if (workspaceFolder.uri.scheme !== 'file' || !shouldActivateAdapter) {
    return;
  }
  logger.info(() => `Activating ${EXTENSION_NAME} for workspace folder: ${workspaceFolderPath}`);

  const adapter = new Adapter(workspaceFolder, channelLog);
  registeredAdapters.set(workspaceFolder, adapter);
  testHub.registerTestAdapter(adapter);

  logger.debug(() => `Done activating adapter for workspace folder: ${workspaceFolderPath}`);
};

const removeAdapterForFolder = (
  workspaceFolder: WorkspaceFolder,
  testHub: TestHub,
  channelLog: OutputChannelLog
): void => {
  const workspaceFolderPath = normalizePath(workspaceFolder.uri.fsPath);
  const config = workspace.getConfiguration(EXTENSION_CONFIG_PREFIX, workspaceFolder.uri);
  const logLevel: LogLevel = config.get<LogLevel>(ConfigSetting.LogLevel, LogLevel.INFO);
  const logger: Logger = new SimpleLogger(channelLog, 'Main', logLevel);
  const adapter = registeredAdapters.get(workspaceFolder);

  if (adapter) {
    logger.info(() => `Deactivating adapter for workspace folder: ${workspaceFolderPath}`);

    testHub.unregisterTestAdapter(adapter);
    registeredAdapters.delete(workspaceFolder);
    adapter.dispose();

    logger.debug(() => `Done deactivating adapter for workspace folder: ${workspaceFolderPath}`);
  }
};

const shouldActivateAdapterForWorkspaceFolder = (
  workspaceFolderPath: string,
  config: WorkspaceConfiguration,
  logger: Logger
): boolean => {
  const enableExtension = config.get<boolean | null>(ConfigSetting.EnableExtension);

  if (typeof enableExtension === 'boolean') {
    logger.debug(
      () =>
        `${enableExtension ? 'Activating' : 'Not activating'} adapter for ` +
        `workspace folder '${workspaceFolderPath}' because the extension has ` +
        `been explicitly ${enableExtension ? 'enabled' : 'disabled'} by setting ` +
        `the '${EXTENSION_CONFIG_PREFIX}.${ConfigSetting.EnableExtension}' ` +
        `setting to ${enableExtension ? 'true' : 'false'}`
    );
    return enableExtension;
  }

  const configuredExtensionSetting = Object.values(ConfigSetting).find(
    configSetting => config.inspect(configSetting)?.workspaceFolderValue ?? false
  );

  if (configuredExtensionSetting !== undefined) {
    logger.debug(
      () =>
        `Activating adapter for workspace folder '${workspaceFolderPath}' ` +
        `because it has one or more extension settings configured: ` +
        `${configuredExtensionSetting}`
    );
    return true;
  }

  const projectRootPath = config.get<string>(ConfigSetting.ProjectRootPath) ?? '';
  const projectPackageJsonFilePath = posix.join(workspaceFolderPath, projectRootPath, 'package.json');
  const workspacePackageJsonFilePath = posix.join(workspaceFolderPath, 'package.json');

  let packageJsonFilePath: string | undefined;

  try {
    if (existsSync(projectPackageJsonFilePath)) {
      packageJsonFilePath = projectPackageJsonFilePath;
    }
  } catch (error) {
    logger.debug(() => `Could not find a project package.json file at ${projectPackageJsonFilePath}`);
  }

  try {
    if (!packageJsonFilePath && existsSync(workspacePackageJsonFilePath)) {
      packageJsonFilePath = workspacePackageJsonFilePath;
    }
  } catch (error) {
    logger.debug(() => `Could not find a workspace package.json file at ${workspacePackageJsonFilePath}`);
  }

  const packageJson: { devDependencies: Record<string, string> } | undefined = packageJsonFilePath
    ? require(projectPackageJsonFilePath)
    : undefined;

  if (packageJson && Object.keys(packageJson.devDependencies).includes('karma')) {
    logger.debug(
      () =>
        `Activating adapter for workspace folder '${workspaceFolderPath}' ` +
        `because related package.json file '${packageJsonFilePath}' has a karma dev dependency`
    );
    return true;
  }

  return false;
};
