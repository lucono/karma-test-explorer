import { commands, extensions, window, workspace } from 'vscode';
import { testExplorerExtensionId, TestHub } from 'vscode-test-adapter-api';
import { Adapter } from './adapter';
import { EXTENSION_CONFIG_PREFIX, EXTENSION_OUTPUT_CHANNEL_NAME } from './constants';
import { ExtensionCommands } from './core/vscode/commands/extension-commands';
import { OutputChannelLog } from './core/vscode/output-channel-log';
import { ProjectFactory } from './project-factory';
import { Disposable } from './util/disposable/disposable';
import { Disposer } from './util/disposable/disposer';
import { LogLevel } from './util/logging/log-level';
import { Logger } from './util/logging/logger';
import { SimpleLogger } from './util/logging/simple-logger';
import { CommandLineProcessHandler } from './util/process/command-line-process-handler';
import { WorkspaceProject, WorkspaceType } from './workspace';

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

  processAddedProjects(allProjects, isMultiProjectWorkspace, workspaceOutputChannel, testHub, logger);

  const workspaceFolderChangeSubscription = workspace.onDidChangeWorkspaceFolders(folderChangeEvent => {
    const addedProjects = projectFactory.createProjectsForWorkspaceFolders(...folderChangeEvent.added);
    processAddedProjects(addedProjects, isMultiProjectWorkspace, workspaceOutputChannel, testHub, logger);

    const removedProjects = [...workspaceProjects].filter(project =>
      folderChangeEvent.removed.includes(project.workspaceFolder)
    );
    processRemovedProjects(removedProjects, testHub, logger);
  });

  disposables.push(workspaceFolderChangeSubscription, workspaceOutputChannel);

  const openProjectCommand = commands.registerCommand(ExtensionCommands.AddProject, async () =>
    processProjectCommand(
      'Select workspace project to add',
      candidateProject => candidateProject.adapter === undefined,
      project => activateProject(project, isMultiProjectWorkspace, workspaceOutputChannel, testHub, logger)
    )
  );
  const closeProjectCommand = commands.registerCommand(ExtensionCommands.RemoveProject, async () =>
    processProjectCommand(
      'Select workspace project to remove',
      candidateProject => candidateProject.adapter !== undefined,
      project => deactivateProject(project, testHub, logger)
    )
  );
  const executeFunctionCommand = commands.registerCommand(ExtensionCommands.ExecuteFunction, (fn: () => void) => fn());

  disposables.push(openProjectCommand, closeProjectCommand, executeFunctionCommand);
};

const createProjectAdapter = (
  project: WorkspaceProject,
  isMultiProjectWorkspace: boolean,
  workspaceOutputChannel: OutputChannelLog,
  testHub: TestHub,
  logger: Logger
): Adapter | undefined => {
  const folderOutputChannel = !isMultiProjectWorkspace ? workspaceOutputChannel : undefined;

  const projectNamespace = project.name;
  let projectAdapter: Adapter | undefined = undefined;

  try {
    logger.info(() => `Activating adapter for project: ${project.workspaceFolderPath} (${project.name})`);

    projectAdapter = new Adapter(project.workspaceFolder, projectNamespace, project.config, folderOutputChannel);
    testHub.registerTestAdapter(projectAdapter);

    logger.debug(() => `Done activating adapter for project: ${project.workspaceFolderPath} (${project.name})`);
  } catch (error) {
    logger.error(
      () => `Failed to create adapater for project - ${project.workspaceFolderPath} (${project.name}): ${error}`
    );
  }

  return projectAdapter;
};

const processProjectCommand = async (
  actionPrompt: string,
  projectFilter: (candidateProject: WorkspaceProject) => boolean,
  projectHandler: (selectedProject: WorkspaceProject) => void
) => {
  const selectedProjectNames = [...workspaceProjects]
    .filter(candidateProject => projectFilter(candidateProject))
    .map(project => project.name)
    .sort((name1, name2) => name1.toLocaleLowerCase().localeCompare(name2.toLocaleLowerCase()));

  const selectedProjectName = await window.showQuickPick(selectedProjectNames, { placeHolder: actionPrompt });
  const selectedProject = [...workspaceProjects].find(project => project.name === selectedProjectName);

  if (selectedProject) {
    projectHandler(selectedProject);
  }
};

const processAddedProjects = (
  projects: readonly WorkspaceProject[],
  isMultiProjectWorkspace: boolean,
  workspaceOutputChannel: OutputChannelLog,
  testHub: TestHub,
  logger: Logger
): void => {
  projects.forEach(project => {
    workspaceProjects.add(project);

    if (!project.adapter && project.isDefault) {
      activateProject(project, isMultiProjectWorkspace, workspaceOutputChannel, testHub, logger);
    }
  });
};

const processRemovedProjects = (projects: readonly WorkspaceProject[], testHub: TestHub, logger: Logger): void => {
  projects.forEach(project => {
    deactivateProject(project, testHub, logger);
    workspaceProjects.delete(project);
  });
};

const activateProject = (
  project: WorkspaceProject,
  isMultiProjectWorkspace: boolean,
  workspaceOutputChannel: OutputChannelLog,
  testHub: TestHub,
  logger: Logger
) => {
  if (project.adapter) {
    return;
  }
  project.adapter = createProjectAdapter(project, isMultiProjectWorkspace, workspaceOutputChannel, testHub, logger);
  updateMultiProjectContext();
};

const deactivateProject = async (project: WorkspaceProject, testHub: TestHub, logger: Logger) => {
  if (!project.adapter) {
    return;
  }
  logger.info(() => `Deactivating adapter for project: ${project.workspaceFolderPath} (${project.name})`);

  testHub.unregisterTestAdapter(project.adapter);
  await project.adapter.dispose();
  project.adapter = undefined;
  updateMultiProjectContext();

  logger.debug(() => `Done deactivating adapter for project: ${project.workspaceFolderPath} (${project.name})`);
};

const updateMultiProjectContext = () => {
  const openProjectCount = [...workspaceProjects].filter(project => project.adapter !== undefined).length;
  const closedProjectCount = [...workspaceProjects].filter(project => project.adapter === undefined).length;

  commands.executeCommand('setContext', `${EXTENSION_CONFIG_PREFIX}.projectsAvailableToAdd`, closedProjectCount > 0);
  commands.executeCommand('setContext', `${EXTENSION_CONFIG_PREFIX}.projectsAvailableToRemove`, openProjectCount > 1);
};

export const deactivate = async () => {
  const adapters = [...workspaceProjects].map(project => project.adapter);
  await Disposer.dispose(adapters, disposables);
  await CommandLineProcessHandler.terminateAll();
};
