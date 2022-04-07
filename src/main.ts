import RichPromise from 'bluebird';
import { basename } from 'path';
import { commands, extensions, QuickPickItem, QuickPickItemKind, window, workspace, WorkspaceFolder } from 'vscode';
import { testExplorerExtensionId, TestHub } from 'vscode-test-adapter-api';
import { Adapter, AdapterOptions } from './adapter';
import { EXTENSION_CONFIG_PREFIX, EXTENSION_OUTPUT_CHANNEL_NAME } from './constants';
import { ConfigChangeManager } from './core/config/config-change-manager';
import { ConfigSetting, WorkspaceConfigSetting } from './core/config/config-setting';
import { ExtensionCommands } from './core/vscode/commands/extension-commands';
import { MultiStatusDisplay } from './core/vscode/notifications/multi-status-display';
import { OutputChannelLog } from './core/vscode/output-channel-log';
import { ProjectFactory } from './project-factory';
import { Disposable } from './util/disposable/disposable';
import { Disposer } from './util/disposable/disposer';
import { LogLevel } from './util/logging/log-level';
import { Logger } from './util/logging/logger';
import { SimpleLogger } from './util/logging/simple-logger';
import { PortAcquisitionManager } from './util/port/port-acquisition-manager';
import { SimpleProcess } from './util/process/simple-process';
import { normalizePath } from './util/utils';
import { WorkspaceProject, WorkspaceType } from './workspace';

interface SharedAdapterComponents {
  portAcquisitionManager: PortAcquisitionManager;
  multiStatusDisplay: MultiStatusDisplay;
}

const workspaceProjects: Set<WorkspaceProject> = new Set();
const disposables: Disposable[] = [];

export const activate = async () => {
  const workspaceOutputChannel = new OutputChannelLog(EXTENSION_OUTPUT_CHANNEL_NAME);
  const testExplorerExtension = extensions.getExtension<TestHub>(testExplorerExtensionId);
  const logger: SimpleLogger = new SimpleLogger(workspaceOutputChannel, 'Main', LogLevel.DEBUG); // FIXME to INFO

  disposables.push(workspaceOutputChannel, logger);

  if (!testExplorerExtension) {
    const errorMsg = 'ERROR: Could not find Test Explorer UI extension';
    logger.error(() => errorMsg);
    throw new Error(errorMsg);
  }
  const testHub = testExplorerExtension.exports;
  const workspaceFolders = workspace.workspaceFolders ?? [];
  const workspaceType = workspaceFolders.length > 1 ? WorkspaceType.MultiFolder : WorkspaceType.SingleFolder;
  const projectFactory = new ProjectFactory(workspaceType, new SimpleLogger(logger, ProjectFactory.name));

  const allProjects = projectFactory.createProjectsForWorkspaceFolders(...workspaceFolders);
  const isMultiProjectWorkspace = allProjects.length > 1;
  const portAcquisitionManager = new PortAcquisitionManager(new SimpleLogger(logger, PortAcquisitionManager.name));
  const multiStatusDisplay = new MultiStatusDisplay(window.createStatusBarItem());

  const configChangeManager = new ConfigChangeManager<ConfigSetting>(
    new SimpleLogger(logger, ConfigChangeManager.name),
    { configNamespace: EXTENSION_CONFIG_PREFIX }
  );

  disposables.push(portAcquisitionManager, configChangeManager);

  const sharedAdapterComponents: SharedAdapterComponents = {
    portAcquisitionManager,
    multiStatusDisplay
  };

  processAddedProjects(
    allProjects,
    isMultiProjectWorkspace,
    workspaceOutputChannel,
    testHub,
    sharedAdapterComponents,
    logger
  );

  const processAddedWorkspaceFolders = (addedWorkspaceFolders: readonly WorkspaceFolder[]) => {
    const addedProjects = projectFactory.createProjectsForWorkspaceFolders(...addedWorkspaceFolders);

    processAddedProjects(
      addedProjects,
      isMultiProjectWorkspace,
      workspaceOutputChannel,
      testHub,
      sharedAdapterComponents,
      logger
    );
  };

  const processRemovedWorkspaceFolders = async (removedWorkspaceFolders: readonly WorkspaceFolder[]) => {
    const removedProjects = [...workspaceProjects].filter(project =>
      removedWorkspaceFolders.some(folder => folder.uri.fsPath === project.workspaceFolder.uri.fsPath)
    );
    await processRemovedProjects(removedProjects, testHub, logger);
  };

  const processChangedWorkspaceFolders = async (changedWorkspaceFolders: readonly WorkspaceFolder[]) => {
    await processRemovedWorkspaceFolders(changedWorkspaceFolders);
    processAddedWorkspaceFolders(changedWorkspaceFolders);
  };

  workspaceFolders.forEach(workspaceFolder => {
    logger.debug(() => 'Subscribing for workspace config changes');
    const workspaceFolderName = basename(normalizePath(workspaceFolder.uri.fsPath));
    const configChangePrompt = `Settings changed for workspace folder ${workspaceFolderName}. Apply settings?`;

    configChangeManager.watchForConfigChange(
      workspaceFolder,
      Object.values(WorkspaceConfigSetting),
      async () => processChangedWorkspaceFolders([workspaceFolder]),
      { promptMessage: configChangePrompt }
    );
  });

  const workspaceFolderChangeSubscription = workspace.onDidChangeWorkspaceFolders(folderChangeEvent => {
    processAddedWorkspaceFolders(folderChangeEvent.added);
    processRemovedWorkspaceFolders(folderChangeEvent.removed);
  });
  disposables.push(workspaceFolderChangeSubscription, workspaceOutputChannel);

  const selectProjectsCommand = commands.registerCommand(ExtensionCommands.SelectProjects, () =>
    processProjectCommand(
      'Select workspace projects to include',
      project =>
        activateProject(
          project,
          isMultiProjectWorkspace,
          workspaceOutputChannel,
          testHub,
          sharedAdapterComponents,
          logger
        ),
      project => deactivateProject(project, testHub, logger)
    )
  );
  const executeFunctionCommand = commands.registerCommand(ExtensionCommands.ExecuteFunction, (fn: () => void) => fn());

  disposables.push(selectProjectsCommand, executeFunctionCommand);
};

const processProjectCommand = async (
  actionPrompt: string,
  projectActivator: (selectedProject: WorkspaceProject) => void,
  projectDeactivator: (selectedProject: WorkspaceProject) => void
) => {
  const allProjectsPickList: QuickPickItem[] = [];
  const workspaceFolderPaths = new Set<string>([...workspaceProjects].map(project => project.workspaceFolderPath));

  workspaceFolderPaths.forEach(workspaceFolderPath => {
    const projectPickList: QuickPickItem[] = [...workspaceProjects]
      .filter(project => project.workspaceFolderPath === workspaceFolderPath)
      .sort((project1, project2) =>
        project1.isDefault === project2.isDefault
          ? project1.name.toLocaleLowerCase().localeCompare(project2.name.toLocaleLowerCase())
          : project1.isDefault
          ? -1
          : 1
      )
      .map(project => ({
        label: project.name,
        description:
          `$(debug-stackframe-dot)` +
          (project.shortProjectPath ? `${project.shortProjectPath}   ` : '') +
          (project.isDefault ? '(default)' : ''),
        picked: project.adapter !== undefined
      }));

    allProjectsPickList.push(
      { label: basename(workspaceFolderPath), kind: QuickPickItemKind.Separator },
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
  const selectedProjectNames = projectPicks.map(projectPick => projectPick.label) ?? [];

  workspaceProjects.forEach(project => {
    const isProjectSelected = selectedProjectNames.includes(project.name);

    if (isProjectSelected && project.adapter === undefined) {
      projectActivator(project);
    } else if (!isProjectSelected && project.adapter !== undefined) {
      projectDeactivator(project);
    }
  });
};

const processAddedProjects = (
  projects: readonly WorkspaceProject[],
  isMultiProjectWorkspace: boolean,
  workspaceOutputChannel: OutputChannelLog,
  testHub: TestHub,
  sharedAdapterComponents: SharedAdapterComponents,
  logger: Logger
): void => {
  projects.forEach(project => {
    workspaceProjects.add(project);

    if (!project.adapter && project.isDefault) {
      activateProject(
        project,
        isMultiProjectWorkspace,
        workspaceOutputChannel,
        testHub,
        sharedAdapterComponents,
        logger
      );
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
  isMultiProjectWorkspace: boolean,
  workspaceOutputChannel: OutputChannelLog,
  testHub: TestHub,
  sharedAdapterComponents: SharedAdapterComponents,
  logger: Logger
) => {
  if (project.adapter) {
    return;
  }
  project.adapter = createProjectAdapter(
    project,
    isMultiProjectWorkspace,
    workspaceOutputChannel,
    testHub,
    sharedAdapterComponents,
    logger
  );
};

const deactivateProject = async (project: WorkspaceProject, testHub: TestHub, logger: Logger) => {
  if (!project.adapter) {
    logger.warn(() => `Request to deactivate project with no adapter`);
    return;
  }
  logger.info(() => `Deactivating adapter for project: ${project.workspaceFolderPath} (${project.name})`);

  testHub.unregisterTestAdapter(project.adapter);
  await project.adapter.dispose();
  project.adapter = undefined;

  logger.debug(() => `Done deactivating adapter for project: ${project.workspaceFolderPath} (${project.name})`);
};

const createProjectAdapter = (
  project: WorkspaceProject,
  isMultiProjectWorkspace: boolean,
  workspaceOutputChannel: OutputChannelLog,
  testHub: TestHub,
  sharedAdapterComponents: SharedAdapterComponents,
  logger: Logger
): Adapter | undefined => {
  const adapterOptions: AdapterOptions = {
    projectNamespace: isMultiProjectWorkspace ? project.name : undefined,
    configOverrides: project.config,
    outputChannelLog: !isMultiProjectWorkspace ? workspaceOutputChannel : undefined
  };

  let projectAdapter: Adapter | undefined = undefined;

  try {
    logger.info(() => `Activating adapter for project: ${project.workspaceFolderPath} (${project.name})`);

    projectAdapter = new Adapter(
      project.workspaceFolder,
      project.displayName,
      sharedAdapterComponents.portAcquisitionManager,
      sharedAdapterComponents.multiStatusDisplay.createDisplay(project.displayName),
      adapterOptions
    );
    testHub.registerTestAdapter(projectAdapter);

    logger.debug(() => `Done activating adapter for project: ${project.workspaceFolderPath} (${project.name})`);
  } catch (error) {
    logger.error(
      () => `Failed to create adapater for project - ${project.workspaceFolderPath} (${project.name}): ${error}`
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
