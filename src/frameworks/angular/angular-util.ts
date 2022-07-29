import { existsSync, readFileSync } from 'fs';
import { posix } from 'path';
import { Logger } from '../../util/logging/logger';
import { normalizePath } from '../../util/utils';
import { AngularProjectInfo } from './angular-project-info';
import { AngularWorkspaceInfo } from './angular-workspace-info';

export const getAngularWorkspaceInfo = (
  angularConfigRootPath: string,
  logger: Logger
): AngularWorkspaceInfo | undefined => {
  return (
    getAngularJsonWorkspaceInfo(angularConfigRootPath, logger) ??
    getAngularCliJsonWorkspaceInfo(angularConfigRootPath, logger)
  );
};

const getAngularJsonWorkspaceInfo = (
  angularConfigRootPath: string,
  logger: Logger
): AngularWorkspaceInfo | undefined => {
  const angularJsonConfigPath = normalizePath(posix.join(angularConfigRootPath, 'angular.json'));

  if (!existsSync(angularJsonConfigPath)) {
    logger.debug(() => `Cannot get Angular projects - Angular Json file does not exist: ${angularJsonConfigPath}`);
    return undefined;
  }
  let angularJson: any;
  try {
    angularJson = JSON.parse(readFileSync(angularJsonConfigPath, 'utf-8'));
  } catch (e) {
    // do nothing
  }

  if (!angularJson) {
    logger.debug(() => `Cannot get Angular projects - Failed to read Angular Json file: ${angularJsonConfigPath}`);
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
    const projectPath = normalizePath(posix.join(angularConfigRootPath, projectConfig.root));
    const karmaConfigPath = normalizePath(
      posix.join(angularConfigRootPath, projectConfig.architect.test.options.karmaConfig)
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
  logger: Logger
): AngularWorkspaceInfo | undefined => {
  const angularCliJsonConfigPath = normalizePath(posix.join(angularConfigRootPath, '.angular-cli.json'));

  if (!existsSync(angularCliJsonConfigPath)) {
    logger.debug(
      () => `Cannot get Angular projects - Angular CLI Json file does not exist: ${angularCliJsonConfigPath}`
    );
    return undefined;
  }
  let angularCliJson: any;
  try {
    angularCliJson = JSON.parse(readFileSync(angularCliJsonConfigPath, 'utf-8'));
  } catch (e) {
    // do nothing
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

  for (const app of angularCliJson.apps) {
    const projectName: string = app.name || angularCliJson.project.name;
    const projectPath = normalizePath(posix.join(angularConfigRootPath, app.root));
    const karmaConfigPath = normalizePath(posix.join(angularConfigRootPath, angularCliJson.test.karma.config));

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
