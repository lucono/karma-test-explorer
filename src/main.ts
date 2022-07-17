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

const MAIN_LOG_LEVEL = LogLevel.DEBUG;
const workspaceProjects: Set<WorkspaceProject> = new Set();
const disposables: Disposable[] = [];

export const activate = async (extensionContext: ExtensionContext) => {
  const workspaceOutputChannel = new OutputChannelLog(`${EXTENSION_OUTPUT_CHANNEL_NAME} (workspace)`);
  disposables.push(workspaceOutputChannel);

  const logger: SimpleLogger = new SimpleLogger(workspaceOutputChannel, 'Main', MAIN_LOG_LEVEL);
  disposables.push(logger);

  const testExplorerExtension = extensions.getExtension<TestHub>(testExplorerExtensionId);

  if (!testExplorerExtension) {
    const errorMsg = 'ERROR: Could not find Test Explorer UI extension';
    logger.error(() => errorMsg);
    throw new Error(errorMsg);
  }
  const testHub = testExplorerExtension.exports;
  const workspaceFolders = workspace.workspaceFolders ?? [];

  const projectFactory = new ProjectFactory(new SimpleLogger(logger, ProjectFactory.name));
  disposables.push(projectFactory);

  const allProjects = projectFactory.createProjectsForWorkspaceFolders(...workspaceFolders);
  const multiStatusDisplay = new MultiStatusDisplay(window.createStatusBarItem());

  const portAcquisitionManager = new PortAcquisitionManager(new SimpleLogger(logger, PortAcquisitionManager.name));
  disposables.push(portAcquisitionManager);

  const configChangeManager = new ConfigChangeManager<WorkspaceConfigSetting>(
    new SimpleLogger(logger, ConfigChangeManager.name),
    { configNamespace: EXTENSION_CONFIG_PREFIX }
  );
  disposables.push(configChangeManager);

  const preferences = new Preferences(
    extensionContext,
    new SimpleLogger(workspaceOutputChannel, Preferences.name, MAIN_LOG_LEVEL)
  );
  disposables.push(preferences);

  const sharedAdapterComponents: SharedAdapterComponents = {
    portAcquisitionManager,
    multiStatusDisplay
  };
  processAddedProjects(allProjects, preferences.lastLoadedProjectPaths, testHub, sharedAdapterComponents, logger);

  const processAddedWorkspaceFolders = (addedWorkspaceFolders: readonly WorkspaceFolder[]) => {
    const addedProjects = projectFactory.createProjectsForWorkspaceFolders(...addedWorkspaceFolders);
    processAddedProjects(addedProjects, preferences.lastLoadedProjectPaths, testHub, sharedAdapterComponents, logger);
  };

  const processRemovedWorkspaceFolders = async (removedWorkspaceFolders: readonly WorkspaceFolder[]) => {
    const removedProjects = [...workspaceProjects].filter(project =>
      removedWorkspaceFolders.some(folder => folder.uri.fsPath === project.workspaceFolder.uri.fsPath)
    );
    await processRemovedProjects(removedProjects, testHub, logger);
  };

  const processChangedWorkspaceFolder = async (
    reconfiguredWorkspaceFolder: WorkspaceFolder,
    changedConfigSettings: WorkspaceConfigSetting[]
  ) => {
    logger.debug(
      () =>
        `Reloading workspace '${normalizePath(reconfiguredWorkspaceFolder.uri.fsPath)}' ` +
        `due to changed settings: ${JSON.stringify(changedConfigSettings)}`
    );

    await processRemovedWorkspaceFolders([reconfiguredWorkspaceFolder]);
    processAddedWorkspaceFolders([reconfiguredWorkspaceFolder]);
  };

  workspaceFolders.forEach(workspaceFolder => {
    logger.debug(() => 'Subscribing for workspace config changes');
    const workspaceFolderName = basename(normalizePath(workspaceFolder.uri.fsPath));
    const configChangePrompt = `Settings changed for workspace folder ${workspaceFolderName}. Apply settings?`;

    configChangeManager.watchForConfigChange(
      workspaceFolder,
      [...Object.values(GeneralConfigSetting), ...Object.values(ExternalConfigSetting)],
      async changedConfigSettings => processChangedWorkspaceFolder(workspaceFolder, changedConfigSettings),
      { promptMessage: configChangePrompt }
    );
  });

  const workspaceFolderChangeSubscription = workspace.onDidChangeWorkspaceFolders(folderChangeEvent => {
    processAddedWorkspaceFolders(folderChangeEvent.added);
    processRemovedWorkspaceFolders(folderChangeEvent.removed);
  });
  disposables.push(workspaceFolderChangeSubscription);

  const selectProjectsCommand = commands.registerCommand(ExtensionCommands.SelectProjects, () =>
    processProjectCommand(
      'Select workspace projects for testing',
      project => activateProject(project, testHub, sharedAdapterComponents, logger),
      project => deactivateProject(project, testHub, logger),
      preferences
    )
  );
  const executeFunctionCommand = commands.registerCommand(ExtensionCommands.ExecuteFunction, (fn: () => void) => fn());

  disposables.push(selectProjectsCommand, executeFunctionCommand);
};

const processProjectCommand = async (
  actionPrompt: string,
  projectActivator: (selectedProject: WorkspaceProject) => void,
  projectDeactivator: (deselectedProject: WorkspaceProject) => void,
  preferences: Preferences
) => {
  const allProjectsPickList: QuickPickItem[] = [];
  const topLevelProjectPaths = new Set<string>([...workspaceProjects].map(project => project.topLevelProjectPath));
  const uniqueShortNames = new Set<string>([...workspaceProjects].map(project => project.shortName));
  const isAllUniqueShortNames = uniqueShortNames.size === workspaceProjects.size;

  topLevelProjectPaths.forEach(topLevelProjectPath => {
    const projectPickList: QuickPickItem[] = [...workspaceProjects]
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

  workspaceProjects.forEach(project => {
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
  projects.forEach(project => {
    workspaceProjects.add(project);

    const shouldActivateProject =
      lastLoadedProjectPaths.length > 0 ? lastLoadedProjectPaths.includes(project.projectPath) : project.isPrimary;

    if (shouldActivateProject) {
      activateProject(project, testHub, sharedAdapterComponents, logger);
    }
  });
  updateMultiProjectContext();
};

const processRemovedProjects = async (projects: readonly WorkspaceProject[], testHub: TestHub, logger: Logger) => {
  const futureDeactivations = projects.map(async project => {
    await deactivateProject(project, testHub, logger);
    workspaceProjects.delete(project);
  });
  await RichPromise.allSettled(futureDeactivations);
  updateMultiProjectContext();
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
  if (!project.adapter) {
    logger.warn(() => `Request to deactivate project with no adapter`);
    return;
  }
  logger.info(() => `Deactivating adapter for project: ${project.workspaceFolderPath} (${project.longName})`);

  testHub.unregisterTestAdapter(project.adapter);
  await project.adapter.dispose();
  project.adapter = undefined;

  logger.debug(() => `Done deactivating adapter for project: ${project.workspaceFolderPath} (${project.longName})`);
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

    logger.debug(() => `Done activating adapter for project: ${project.workspaceFolderPath} (${project.longName})`);
  } catch (error) {
    logger.error(
      () => `Failed to create adapter for project - ${project.workspaceFolderPath} (${project.longName}): ${error}`
    );
  }

  return projectAdapter;
};

const updateMultiProjectContext = () => {
  commands.executeCommand('setContext', `${EXTENSION_CONFIG_PREFIX}.allowProjectSelection`, workspaceProjects.size > 1);
};

export const deactivate = async () => {
  const adapters = [...workspaceProjects].map(project => project.adapter);
  await Disposer.dispose(adapters, disposables);
  await SimpleProcess.terminateAll();
};
