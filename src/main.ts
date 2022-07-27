import RichPromise from 'bluebird';
import { basename } from 'path';
import {
  commands,
  ExtensionContext,
  extensions,
  QuickPickItem,
  QuickPickItemKind,
  window,
  workspace,
  WorkspaceFolder
} from 'vscode';
import { testExplorerExtensionId, TestHub } from 'vscode-test-adapter-api';
import { Adapter } from './adapter';
import { EXTENSION_CONFIG_PREFIX, EXTENSION_OUTPUT_CHANNEL_NAME } from './constants';
import { ConfigChangeManager } from './core/config/config-change-manager';
import { ExternalConfigSetting, GeneralConfigSetting, WorkspaceConfigSetting } from './core/config/config-setting';
import { ExtensionCommands } from './core/vscode/commands/extension-commands';
import { MultiStatusDisplay } from './core/vscode/notifications/multi-status-display';
import { OutputChannelLog } from './core/vscode/output-channel-log';
import { Preferences } from './core/vscode/preferences/preferences';
import { ProjectFactory } from './project-factory';
import { Disposable } from './util/disposable/disposable';
import { Disposer } from './util/disposable/disposer';
import { LogLevel } from './util/logging/log-level';
import { Logger } from './util/logging/logger';
import { SimpleLogger } from './util/logging/simple-logger';
import { PortAcquisitionManager } from './util/port/port-acquisition-manager';
import { SimpleProcess } from './util/process/simple-process';
import { normalizePath } from './util/utils';
import { WorkspaceProject } from './workspace';

interface SharedAdapterComponents {
  portAcquisitionManager: PortAcquisitionManager;
  multiStatusDisplay: MultiStatusDisplay;
}

const MAIN_LOG_LEVEL = LogLevel.TRACE;
const disposables: Disposable[] = [];
const allWorkspaceProjects: Set<WorkspaceProject> = new Set();

export const activate = async (extensionContext: ExtensionContext) => {
  // --- Create Logger ---

  const workspaceOutputChannel = new OutputChannelLog(`${EXTENSION_OUTPUT_CHANNEL_NAME} (workspace)`);
  disposables.push(workspaceOutputChannel);

  const logger: SimpleLogger = new SimpleLogger(workspaceOutputChannel, 'Main', MAIN_LOG_LEVEL);
  disposables.push(logger);

  // --- Obtain Test Explorer Hub ---

  const testExplorerExtension = extensions.getExtension<TestHub>(testExplorerExtensionId);

  if (!testExplorerExtension) {
    const errorMsg = 'ERROR: Could not find Test Explorer UI extension';
    logger.error(() => errorMsg);
    throw new Error(errorMsg);
  }
  const testHub = testExplorerExtension.exports;

  // --- Create Global Components ---

  logger.info(() => `Creating project factory`);
  const projectFactory = new ProjectFactory(new SimpleLogger(logger, ProjectFactory.name));
  disposables.push(projectFactory);

  logger.info(() => `Creating config change manager`);
  const configChangeManager = new ConfigChangeManager<WorkspaceConfigSetting>(
    new SimpleLogger(logger, ConfigChangeManager.name),
    { configNamespace: EXTENSION_CONFIG_PREFIX }
  );
  disposables.push(configChangeManager);

  logger.info(() => `Creating preference manager`);
  const preferences = new Preferences(
    extensionContext,
    new SimpleLogger(workspaceOutputChannel, Preferences.name, MAIN_LOG_LEVEL)
  );
  disposables.push(preferences);

  logger.info(() => `Creating port acquisition manager`);
  const portAcquisitionManager = new PortAcquisitionManager(new SimpleLogger(logger, PortAcquisitionManager.name));
  disposables.push(portAcquisitionManager);

  logger.info(() => `Creating multi-status display`);
  const multiStatusDisplay = new MultiStatusDisplay(window.createStatusBarItem());

  const sharedAdapterComponents: SharedAdapterComponents = {
    portAcquisitionManager,
    multiStatusDisplay
  };

  // --- Define Workspace Handling Functions ---

  const subscribeForWorkspaceConfigChanges = (workspaceFolders: readonly WorkspaceFolder[]) => {
    workspaceFolders.forEach(workspaceFolder => {
      const workspaceFolderPath = normalizePath(workspaceFolder.uri.fsPath);
      logger.info(() => `Subscribing to config changes for workspace folder: ${workspaceFolderPath}`);

      const workspaceFolderName = basename(workspaceFolderPath);
      const configChangePrompt = `Settings changed for workspace folder ${workspaceFolderName}. Apply settings?`;

      configChangeManager.subscribeForConfigChanges(
        workspaceFolder,
        [...Object.values(GeneralConfigSetting), ...Object.values(ExternalConfigSetting)],
        async changedConfigSettings => processChangedWorkspaceFolder(workspaceFolder, changedConfigSettings),
        { promptMessage: configChangePrompt }
      );
    });
  };

  const unsubscribeForWorkspaceConfigChanges = (workspaceFolders: readonly WorkspaceFolder[]) => {
    workspaceFolders.forEach(workspaceFolder => {
      const workspaceFolderPath = normalizePath(workspaceFolder.uri.fsPath);
      logger.info(() => `Unsubscribing to config changes for workspace folder: ${workspaceFolderPath}`);
      configChangeManager.unsubscribeWorkspaceFolderForConfigChanges(workspaceFolder);
    });
  };

  const processAddedWorkspaceFolders = (addedWorkspaceFolders: readonly WorkspaceFolder[]) => {
    const workspaceFolderPaths = addedWorkspaceFolders.map(workspaceFolder =>
      normalizePath(workspaceFolder.uri.fsPath)
    );
    logger.info(() => `Discovering projects for workspace folders: ${JSON.stringify(workspaceFolderPaths, null, 2)}`);

    const addedProjects = projectFactory.createProjectsForWorkspaceFolders(...addedWorkspaceFolders);
    processAddedProjects(addedProjects, preferences.lastLoadedProjectPaths, testHub, sharedAdapterComponents, logger);
    subscribeForWorkspaceConfigChanges(addedWorkspaceFolders);
  };

  const processRemovedWorkspaceFolders = async (removedWorkspaceFolders: readonly WorkspaceFolder[]) => {
    const workspaceFolderPaths = removedWorkspaceFolders.map(workspaceFolder =>
      normalizePath(workspaceFolder.uri.fsPath)
    );
    logger.info(() => `Removing projects for workspace folders: ${JSON.stringify(workspaceFolderPaths, null, 2)}`);
    unsubscribeForWorkspaceConfigChanges(removedWorkspaceFolders);

    const removedProjects = [...allWorkspaceProjects].filter(project =>
      removedWorkspaceFolders.some(folder => folder.uri.fsPath === project.workspaceFolder.uri.fsPath)
    );
    await processRemovedProjects(removedProjects, testHub, logger);
  };

  const processChangedWorkspaceFolder = async (
    reconfiguredWorkspaceFolder: WorkspaceFolder,
    changedConfigSettings: WorkspaceConfigSetting[]
  ) => {
    logger.info(
      () =>
        `Reloading workspace '${normalizePath(reconfiguredWorkspaceFolder.uri.fsPath)}' ` +
        `due to changed settings: ${changedConfigSettings.join(', ')}`
    );
    await processRemovedWorkspaceFolders([reconfiguredWorkspaceFolder]);
    processAddedWorkspaceFolders([reconfiguredWorkspaceFolder]);
  };

  // --- Register Commands ---

  logger.info(() => `Registering project selection command`);
  const selectProjectsCommand = commands.registerCommand(ExtensionCommands.SelectProjects, () =>
    processProjectCommand(
      'Select workspace projects for testing',
      project => activateProject(project, testHub, sharedAdapterComponents, logger),
      project => deactivateProject(project, testHub, logger),
      preferences
    )
  );
  disposables.push(selectProjectsCommand);

  logger.info(() => `Registering function execution command`);
  const executeFunctionCommand = commands.registerCommand(ExtensionCommands.ExecuteFunction, (fn: () => void) => fn());
  disposables.push(executeFunctionCommand);

  // --- Initialize ---

  logger.info(() => `Setting initial multi-project context`);
  updateMultiProjectContext(logger);

  logger.info(() => `Processing initial workspace folders`);
  processAddedWorkspaceFolders(workspace.workspaceFolders ?? []);

  logger.info(() => `Subscribing for subsequent workspace folder additions and removals`);
  const workspaceFolderChangeSubscription = workspace.onDidChangeWorkspaceFolders(folderChangeEvent => {
    processAddedWorkspaceFolders(folderChangeEvent.added);
    processRemovedWorkspaceFolders(folderChangeEvent.removed);
  });
  disposables.push(workspaceFolderChangeSubscription);
};

const processProjectCommand = async (
  actionPrompt: string,
  projectActivator: (selectedProject: WorkspaceProject) => void,
  projectDeactivator: (deselectedProject: WorkspaceProject) => void,
  preferences: Preferences
) => {
  const allProjectsPickList: QuickPickItem[] = [];
  const topLevelProjectPaths = new Set<string>([...allWorkspaceProjects].map(project => project.topLevelProjectPath));
  const uniqueShortNames = new Set<string>([...allWorkspaceProjects].map(project => project.shortName));
  const isAllUniqueShortNames = uniqueShortNames.size === allWorkspaceProjects.size;

  topLevelProjectPaths.forEach(topLevelProjectPath => {
    const projectPickList: QuickPickItem[] = [...allWorkspaceProjects]
      .filter(project => project.topLevelProjectPath === topLevelProjectPath)
      .sort((project1, project2) =>
        !!project1.adapter === !!project2.adapter
          ? project1.longName.toLocaleLowerCase().localeCompare(project2.longName.toLocaleLowerCase())
          : project1.adapter !== undefined
          ? -1
          : 1
      )
      .map(project => ({
        label: isAllUniqueShortNames ? project.shortName : project.longName,
        description: `$(debug-stackframe-dot)` + (project.shortProjectPath || '(root)'),
        picked: project.adapter !== undefined
      }));

    allProjectsPickList.push(
      { label: basename(topLevelProjectPath), kind: QuickPickItemKind.Separator },
      ...projectPickList
    );
  });

  const projectPicks = await window.showQuickPick(allProjectsPickList, {
    placeHolder: actionPrompt,
    canPickMany: true
  });

  if (projectPicks === undefined) {
    return;
  }
  const selectedProjectLabels = projectPicks.map(projectPick => projectPick.label);
  const selectedProjects: WorkspaceProject[] = [];
  const deselectedProjects: WorkspaceProject[] = [];

  allWorkspaceProjects.forEach(project => {
    const projectLabel = isAllUniqueShortNames ? project.shortName : project.longName;
    const isProjectSelected = selectedProjectLabels.includes(projectLabel);

    (isProjectSelected ? selectedProjects : deselectedProjects).push(project);
  });

  deselectedProjects.forEach(project => projectDeactivator(project));
  selectedProjects.forEach(project => projectActivator(project));

  const selectedProjectPaths = selectedProjects.map(project => project.projectPath);
  preferences.lastLoadedProjectPaths = selectedProjectPaths;
};

const processAddedProjects = (
  projects: readonly WorkspaceProject[],
  lastLoadedProjectPaths: readonly string[],
  testHub: TestHub,
  sharedAdapterComponents: SharedAdapterComponents,
  logger: Logger
): void => {
  if (projects.length === 0) {
    logger.info(() => `Ignoring empty added project list`);
    return;
  }
  logger.info(() => `Last loaded projects: ${JSON.stringify(lastLoadedProjectPaths, null, 2)}`);

  projects.forEach(project => {
    logger.info(() => `Registering project: ${project.projectPath}`);
    allWorkspaceProjects.add(project);

    const shouldActivateProject =
      lastLoadedProjectPaths.length > 0 ? lastLoadedProjectPaths.includes(project.projectPath) : project.isPrimary;

    if (shouldActivateProject) {
      activateProject(project, testHub, sharedAdapterComponents, logger);
    }
  });
  const noProjectsActivated = ![...allWorkspaceProjects].some(project => project.adapter !== undefined);

  if (noProjectsActivated) {
    activateProject(projects[0], testHub, sharedAdapterComponents, logger);
  }
  updateMultiProjectContext(logger);
};

const processRemovedProjects = async (projects: readonly WorkspaceProject[], testHub: TestHub, logger: Logger) => {
  const projectPaths = projects.map(project => project.projectPath);
  logger.info(() => `Unregistering projects: ${JSON.stringify(projectPaths, null, 2)}`);

  const futureDeactivations = projects.map(async project => {
    await deactivateProject(project, testHub, logger);
    allWorkspaceProjects.delete(project);
  });
  await RichPromise.allSettled(futureDeactivations);
  updateMultiProjectContext(logger);
};

const activateProject = (
  project: WorkspaceProject,
  testHub: TestHub,
  sharedAdapterComponents: SharedAdapterComponents,
  logger: Logger
) => {
  if (project.adapter) {
    return;
  }
  project.adapter = createProjectAdapter(project, testHub, sharedAdapterComponents, logger);
};

const deactivateProject = async (project: WorkspaceProject, testHub: TestHub, logger: Logger) => {
  const projectPathAndName = `${project.workspaceFolderPath} (${project.longName})`;

  if (!project.adapter) {
    logger.info(() => `Project is not activated: ${projectPathAndName}`);
    return;
  }
  logger.info(() => `Deactivating adapter for project: ${projectPathAndName}`);

  testHub.unregisterTestAdapter(project.adapter);
  await project.adapter.dispose();
  project.adapter = undefined;

  logger.info(() => `Done deactivating adapter for project: ${project.workspaceFolderPath} (${project.longName})`);
};

const createProjectAdapter = (
  project: WorkspaceProject,
  testHub: TestHub,
  sharedAdapterComponents: SharedAdapterComponents,
  logger: Logger
): Adapter | undefined => {
  const projectNamespace = project.longName;
  let projectAdapter: Adapter | undefined = undefined;

  try {
    logger.info(() => `Activating adapter for project: ${project.workspaceFolderPath} (${project.longName})`);

    projectAdapter = new Adapter(
      project.workspaceFolder,
      project.shortName,
      projectNamespace,
      project.config,
      sharedAdapterComponents.portAcquisitionManager,
      sharedAdapterComponents.multiStatusDisplay.createDisplay(project.shortName)
    );
    testHub.registerTestAdapter(projectAdapter);

    logger.info(() => `Done activating adapter for project: ${project.workspaceFolderPath} (${project.longName})`);
  } catch (error) {
    logger.error(
      () => `Failed to create adapter for project - ${project.workspaceFolderPath} (${project.longName}): ${error}`
    );
  }

  return projectAdapter;
};

const updateMultiProjectContext = (logger: Logger) => {
  const multiProjectEnabled = allWorkspaceProjects.size > 1;

  logger.info(() => `Setting multi-project context to: ${multiProjectEnabled}`);
  commands.executeCommand('setContext', `${EXTENSION_CONFIG_PREFIX}.allowProjectSelection`, multiProjectEnabled);
};

export const deactivate = async () => {
  const adapters = [...allWorkspaceProjects].map(project => project.adapter);
  await Disposer.dispose(adapters, disposables);
  await SimpleProcess.terminateAll();
};
