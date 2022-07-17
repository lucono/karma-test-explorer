import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { normalizePath } from '../../util/utils';
import { AngularProjectInfo } from './angular-project-info';

export const getDefaultAngularProject = (
  angularConfigRootPath: string,
  angularProjectList?: AngularProjectInfo[]
): AngularProjectInfo | undefined => {
  const angularProjects = angularProjectList ?? getAllAngularProjects(angularConfigRootPath);
  const defaultProject: AngularProjectInfo | undefined = angularProjects.filter(project => project.isDefaultProject)[0];
  return defaultProject ?? angularProjectList?.[0];
};

export const getAllAngularProjects = (angularConfigRootPath: string): AngularProjectInfo[] => {
  const angularJsonPath = getAngularJsonConfigPath(angularConfigRootPath);
  const angularCliJsonPath = getAngularCliJsonConfigPath(angularConfigRootPath);
  let projects: AngularProjectInfo[] = [];

  if (angularJsonPath !== undefined) {
    projects = mapAngularJsonObject(angularConfigRootPath, angularJsonPath);
  } else if (angularCliJsonPath !== undefined) {
    projects = mapAngularCliJsonObject(angularConfigRootPath, angularCliJsonPath);
  }
  return projects;
};

const getAngularJsonConfigPath = (angularConfigRootPath: string): string | undefined => {
  const angularJsonConfigPath = normalizePath(resolve(angularConfigRootPath, 'angular.json'));
  return existsSync(angularJsonConfigPath) ? angularJsonConfigPath : undefined;
};

const getAngularCliJsonConfigPath = (angularConfigRootPath: string): string | undefined => {
  const angularCliJsonConfigPath = normalizePath(resolve(angularConfigRootPath, '.angular-cli.json'));
  return existsSync(angularCliJsonConfigPath) ? angularCliJsonConfigPath : undefined;
};

const mapAngularCliJsonObject = (angularConfigRootPath: string, angularCliJsonPath: string): AngularProjectInfo[] => {
  const angularJsonObject = JSON.parse(readFileSync(angularCliJsonPath, 'utf8'));
  const projects: AngularProjectInfo[] = [];

  for (const app of angularJsonObject.apps) {
    const appName: string = app.name || angularJsonObject.project.name;
    const appPath = normalizePath(resolve(angularConfigRootPath, app.root));
    const karmaConfigPath = resolve(angularConfigRootPath, angularJsonObject.test.karma.config);
    const isAngularDefaultProject = angularJsonObject.project.name === appName;

    const project: AngularProjectInfo = {
      name: appName,
      rootPath: appPath,
      isDefaultProject: isAngularDefaultProject,
      karmaConfigPath
    };
    projects.push(project);
  }
  return projects;
};

const mapAngularJsonObject = (angularConfigRootPath: string, angularJsonPath: string): AngularProjectInfo[] => {
  const angularJsonObject = JSON.parse(readFileSync(angularJsonPath, 'utf-8'));
  const projects: AngularProjectInfo[] = [];

  for (const projectName of Object.keys(angularJsonObject.projects)) {
    const projectConfig = angularJsonObject.projects[projectName];

    if (projectConfig.architect.test === undefined || projectConfig.architect.test.options.karmaConfig === undefined) {
      continue;
    }
    const projectPath = resolve(angularConfigRootPath, projectConfig.root);
    const karmaConfigPath = resolve(angularConfigRootPath, projectConfig.architect.test.options.karmaConfig);
    const isAngularDefaultProject = angularJsonObject.defaultProject === projectName;

    const project: AngularProjectInfo = {
      name: projectName,
      rootPath: projectPath,
      isDefaultProject: isAngularDefaultProject,
      karmaConfigPath
    };
    projects.push(project);
  }
  return projects;
};
