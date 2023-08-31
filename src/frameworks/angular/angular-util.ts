import { walkSync } from '@nodelib/fs.walk';
import { join } from 'path';

import { FileHandler } from '../../util/filesystem/file-handler.js';
import { Logger } from '../../util/logging/logger.js';
import { normalizePath } from '../../util/utils.js';
import { DefaultCommand } from '../../workspace.js';
import { AngularProjectInfo } from './angular-project-info.js';
import { AngularWorkspaceInfo } from './angular-workspace-info.js';

const DefaultAngularCommand: DefaultCommand = { package: '@angular/cli', path: ['bin', 'ng'] };

export const getAngularWorkspaceInfo = (
  angularConfigRootPath: string,
  fileHandler: FileHandler,
  logger: Logger
): AngularWorkspaceInfo | undefined => {
  return (
    getProjectJsonWorkspaceInfo(angularConfigRootPath, fileHandler, logger) ??
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
    logger.warn(() => `Cannot get Angular projects for Angular config file '${angularJsonConfigPath}': ${error}`);
  }

  if (!angularJson) {
    return undefined;
  }
  const defaultProjectName: string = angularJson.defaultProject;
  const projects: AngularProjectInfo[] = [];
  let defaultProject: AngularProjectInfo | undefined;

  for (const projectName of Object.keys(angularJson.projects)) {
    const projectConfig = angularJson.projects[projectName];
    const projectPath = normalizePath(join(angularConfigRootPath, projectConfig.root));

    const karmaConfigPath = projectConfig.architect?.test?.options?.karmaConfig
      ? normalizePath(join(angularConfigRootPath, projectConfig.architect.test.options.karmaConfig))
      : undefined;

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
    defaultProject,
    defaultCommand: DefaultAngularCommand
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
    logger.warn(
      () => `Cannot get Angular projects for Angular CLI config file '${angularCliJsonConfigPath}': ${error}`
    );
  }

  if (!angularCliJson) {
    return undefined;
  }
  const defaultProjectName: string = angularCliJson.project.name;
  const projects: AngularProjectInfo[] = [];
  let defaultProject: AngularProjectInfo | undefined;

  const karmaConfigPath = angularCliJson.test?.karma?.config
    ? normalizePath(join(angularConfigRootPath, angularCliJson.test.karma.config))
    : undefined;

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
    defaultProject,
    defaultCommand: DefaultAngularCommand
  };
  return workspaceInfo;
};

const getProjectJsonWorkspaceInfo = (
  angularConfigRootPath: string,
  fileHandler: FileHandler,
  logger: Logger
): AngularWorkspaceInfo | undefined => {
  if (!fileHandler.existsSync(normalizePath(join(angularConfigRootPath, 'nx.json')))) {
    logger.debug(() => `${angularConfigRootPath}: not nx root`);
    return undefined;
  }

  const projects = walkSync(angularConfigRootPath, {
    deepFilter: v => !v.path.startsWith('.') && !v.path.startsWith('node_modules'),
    entryFilter: v => v.name === 'project.json'
  })
    .map<AngularProjectInfo | undefined>(projectJsonFileEntry => {
      let projectJson: any;

      try {
        const projectJsonContent = fileHandler.readFileSync(projectJsonFileEntry.path, 'utf-8');
        projectJson = projectJsonContent ? JSON.parse(projectJsonContent) : undefined;
      } catch (error) {
        logger.warn(() => `Cannot get nx project for config file '${projectJsonFileEntry.path}': ${error}`);
      }

      if (!projectJson) {
        logger.warn(() => 'Cannot parse project.json');
        return undefined;
      }

      const karmaConfig = projectJson.targets?.test?.options?.karmaConfig;

      const karmaConfigPath = karmaConfig ? normalizePath(join(angularConfigRootPath, karmaConfig)) : undefined;
      if (!karmaConfigPath) {
        logger.warn(() => `unknown karma config path`);
        return undefined;
      }

      return { name: projectJson.name, rootPath: angularConfigRootPath, karmaConfigPath };
    })
    .filter((project): project is AngularProjectInfo => project !== undefined);

  if (projects.length === 0) {
    logger.warn(() => `${angularConfigRootPath}: no nx projects`);
    return undefined;
  }

  return { projects: projects, defaultProject: undefined, defaultCommand: { package: 'nx', path: ['bin', 'nx'] } };
};
