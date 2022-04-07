import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { AngularProject } from './angular-project';

export const getDefaultAngularProject = (
  workspaceRootPath: string,
  preferredDefaultProject?: string,
  angularProjectList?: AngularProject[]
): AngularProject | undefined => {
  const defaultProjects = getDefaultAngularProjects(
    workspaceRootPath,
    preferredDefaultProject ? [preferredDefaultProject] : [],
    angularProjectList
  );
  return defaultProjects[0];
};

export const getDefaultAngularProjects = (
  workspaceRootPath: string,
  preferredDefaultProjects: string[] = [],
  angularProjectList?: AngularProject[]
): AngularProject[] => {
  const angularProjects = angularProjectList ?? getAllAngularProjects(workspaceRootPath);
  let defaultProjects: AngularProject[] = [];

  if (preferredDefaultProjects.length > 0) {
    defaultProjects = angularProjects.filter(project => preferredDefaultProjects.includes(project.name));
  }
  if (defaultProjects.length === 0) {
    defaultProjects = angularProjects.filter(project => project.isDefaultProject);
  }
  if (defaultProjects.length === 0 && angularProjects.length > 0) {
    defaultProjects = [angularProjects[0]];
  }
  return defaultProjects;
};

export const getAllAngularProjects = (workspaceRootPath: string): AngularProject[] => {
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

const getAngularJsonConfigPath = (workspaceRootPath: string): string | undefined => {
  const angularJsonConfigPath = join(workspaceRootPath, 'angular.json');
  return existsSync(angularJsonConfigPath) ? angularJsonConfigPath : undefined;
};

const getAngularCliJsonConfigPath = (workspaceRootPath: string): string | undefined => {
  const angularCliJsonConfigPath = join(workspaceRootPath, '.angular-cli.json');
  return existsSync(angularCliJsonConfigPath) ? angularCliJsonConfigPath : undefined;
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
