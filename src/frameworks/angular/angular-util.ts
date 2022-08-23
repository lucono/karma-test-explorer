import { join } from 'path';
import { FileHandler } from '../../util/filesystem/file-handler';
import { Logger } from '../../util/logging/logger';
import { normalizePath } from '../../util/utils';
import { AngularProjectInfo } from './angular-project-info';
import { AngularWorkspaceInfo } from './angular-workspace-info';

export const getAngularWorkspaceInfo = (
  angularConfigRootPath: string,
  fileHandler: FileHandler,
  logger: Logger
): AngularWorkspaceInfo | undefined => {
  return (
    getAngularJsonWorkspaceInfo(angularConfigRootPath, fileHandler, logger) ??
    getAngularCliJsonWorkspaceInfo(angularConfigRootPath, fileHandler, logger)
  );
};

const getAngularJsonWorkspaceInfo = (
  angularConfigRootPath: string,
  fileHandler: FileHandler,
  logger: Logger
): AngularWorkspaceInfo | undefined => {
  const angularJsonConfigPath = normalizePath(join(angularConfigRootPath, 'angular.json'));

  if (!fileHandler.existsSync(angularJsonConfigPath)) {
    logger.debug(() => `Cannot get Angular projects - Angular Json file does not exist: ${angularJsonConfigPath}`);
    return undefined;
  }
  let angularJson: any;

  try {
    const angularJsonContent = fileHandler.readFileSync(angularJsonConfigPath, 'utf-8');
    angularJson = angularJsonContent ? JSON.parse(angularJsonContent) : undefined;
  } catch (error) {
    // No action required
  }

  if (!angularJson) {
    logger.warn(() => `Cannot get Angular projects - Failed to read Angular Json file: ${angularJsonConfigPath}`);
    return undefined;
  }
  const defaultProjectName: string = angularJson.defaultProject;
  const projects: AngularProjectInfo[] = [];
  let defaultProject: AngularProjectInfo | undefined;

  for (const projectName of Object.keys(angularJson.projects)) {
    const projectConfig = angularJson.projects[projectName];

    if (projectConfig.architect.test === undefined || projectConfig.architect.test.options.karmaConfig === undefined) {
      continue;
    }
    const projectPath = normalizePath(join(angularConfigRootPath, projectConfig.root));

    const karmaConfigPath = normalizePath(
      join(angularConfigRootPath, projectConfig.architect?.test?.options?.karmaConfig)
    );

    const project: AngularProjectInfo = {
      name: projectName,
      rootPath: projectPath,
      karmaConfigPath
    };
    projects.push(project);

    defaultProject = defaultProject
      ? defaultProject
      : !!defaultProjectName && projectName === defaultProjectName
      ? project
      : undefined;
  }

  if (projects.length === 0) {
    logger.warn(() => `No Angular projects found for Angular config: ${angularJsonConfigPath}`);
  }
  const workspaceInfo: AngularWorkspaceInfo = {
    projects,
    defaultProject: defaultProject ?? projects[0]
  };
  return workspaceInfo;
};

const getAngularCliJsonWorkspaceInfo = (
  angularConfigRootPath: string,
  fileHandler: FileHandler,
  logger: Logger
): AngularWorkspaceInfo | undefined => {
  const angularCliJsonConfigPath = normalizePath(join(angularConfigRootPath, '.angular-cli.json'));

  if (!fileHandler.existsSync(angularCliJsonConfigPath)) {
    logger.debug(
      () => `Cannot get Angular projects - Angular CLI Json file does not exist: ${angularCliJsonConfigPath}`
    );
    return undefined;
  }
  let angularCliJson: any;

  try {
    const angularCliJsonContent = fileHandler.readFileSync(angularCliJsonConfigPath, 'utf-8');
    angularCliJson = angularCliJsonContent ? JSON.parse(angularCliJsonContent) : undefined;
  } catch (error) {
    // No action required
  }

  if (!angularCliJson) {
    logger.debug(
      () => `Cannot get Angular CLI projects - Failed to read Angular Json file: ${angularCliJsonConfigPath}`
    );
    return undefined;
  }
  const defaultProjectName: string = angularCliJson.project.name;
  const projects: AngularProjectInfo[] = [];
  let defaultProject: AngularProjectInfo | undefined;

  const karmaConfigPath = normalizePath(join(angularConfigRootPath, angularCliJson.test?.karma?.config));

  for (const app of angularCliJson.apps) {
    const projectName: string = app.name || angularCliJson.project.name;
    const projectPath = normalizePath(join(angularConfigRootPath, app.root));

    const project: AngularProjectInfo = {
      name: projectName,
      rootPath: projectPath,
      karmaConfigPath
    };
    projects.push(project);

    defaultProject = defaultProject
      ? defaultProject
      : !!defaultProjectName && projectName === defaultProjectName
      ? project
      : undefined;
  }

  if (projects.length === 0) {
    logger.warn(() => `No Angular projects found for Angular config: ${angularCliJsonConfigPath}`);
  }
  const workspaceInfo: AngularWorkspaceInfo = {
    projects,
    defaultProject: defaultProject ?? projects[0]
  };
  return workspaceInfo;
};
