import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { AngularProject } from './angular-project';

export const getDefaultAngularProject = (
  workspaceRootPath: string,
  configuredDefaultProject: string = ''
): AngularProject | undefined => {
  const angularProjects = getAllAngularProjects(workspaceRootPath);
  let defaultProject: AngularProject | undefined;

  if (configuredDefaultProject !== '') {
    defaultProject = angularProjects.find(project => project.name === configuredDefaultProject);
  }
  if (defaultProject === undefined) {
    defaultProject = angularProjects.find(project => project.isDefaultProject);
  }
  if (defaultProject === undefined && angularProjects.length > 0) {
    defaultProject = angularProjects[0];
  }
  return defaultProject;
};

export const hasAngularProject = (workspaceRootPath: string): boolean => {
  const angularJsonPath = getAngularJsonConfigPath(workspaceRootPath);
  const angularCliJsonPath = getAngularCliJsonConfigPath(workspaceRootPath);
  return !!(angularJsonPath || angularCliJsonPath);
};

const getAngularJsonConfigPath = (workspaceRootPath: string): string | undefined => {
  const angularJsonConfigPath = join(workspaceRootPath, 'angular.json');
  return existsSync(angularJsonConfigPath) ? angularJsonConfigPath : undefined;
};

const getAngularCliJsonConfigPath = (workspaceRootPath: string): string | undefined => {
  const angularCliJsonConfigPath = join(workspaceRootPath, '.angular-cli.json');
  return existsSync(angularCliJsonConfigPath) ? angularCliJsonConfigPath : undefined;
};

const getAllAngularProjects = (workspaceRootPath: string): AngularProject[] => {
  const angularJsonPath = getAngularJsonConfigPath(workspaceRootPath);
  const angularCliJsonPath = getAngularCliJsonConfigPath(workspaceRootPath);
  let projects: AngularProject[] = [];

  if (angularJsonPath !== undefined) {
    projects = mapAngularJsonObject(workspaceRootPath, angularJsonPath);
  } else if (angularCliJsonPath !== undefined) {
    projects = mapAngularCliJsonObject(workspaceRootPath, angularCliJsonPath);
  }
  return projects;
};

const mapAngularCliJsonObject = (workspaceRootPath: string, angularCliJsonPath: string): AngularProject[] => {
  const angularJsonObject = JSON.parse(readFileSync(angularCliJsonPath, 'utf8'));
  const projects: AngularProject[] = [];

  for (const app of angularJsonObject.apps) {
    const appName: string = app.name || angularJsonObject.project.name;
    const appPath = join(workspaceRootPath, app.root);
    const karmaConfigPath = join(workspaceRootPath, angularJsonObject.test.karma.config);
    const isAngularDefaultProject = angularJsonObject.project.name === appName;

    const project: AngularProject = {
      name: appName,
      rootPath: appPath,
      isDefaultProject: isAngularDefaultProject,
      karmaConfigPath
    };
    projects.push(project);
  }
  return projects;
};

const mapAngularJsonObject = (workspaceRootPath: string, angularJsonPath: string): AngularProject[] => {
  const angularJsonObject = JSON.parse(readFileSync(angularJsonPath, 'utf-8'));
  const projects: AngularProject[] = [];

  for (const projectName of Object.keys(angularJsonObject.projects)) {
    const projectConfig = angularJsonObject.projects[projectName];

    if (projectConfig.architect.test === undefined || projectConfig.architect.test.options.karmaConfig === undefined) {
      continue;
    }
    const projectPath = join(workspaceRootPath, projectConfig.root);
    const karmaConfigPath = join(workspaceRootPath, projectConfig.architect.test.options.karmaConfig);
    const isAngularDefaultProject = angularJsonObject.defaultProject === projectName;

    const project: AngularProject = {
      name: projectName,
      rootPath: projectPath,
      isDefaultProject: isAngularDefaultProject,
      karmaConfigPath
    };
    projects.push(project);
  }
  return projects;
};
