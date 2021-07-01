import { AngularProject } from './angular-project';
import { window } from 'vscode';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';

export const getDefaultAngularProject = (workspaceRootPath: string, configDefaultProject?: string): AngularProject => {
	const angularProjects = getAllAngularProjects(workspaceRootPath);
	let project = angularProjects.find(x => x.isDefaultProject);
	if (configDefaultProject !== '') {
		project = angularProjects.find(x => x.name === configDefaultProject);
	}
	if (project === undefined) {
		project = angularProjects[0];
	}
	return project;
};

const getAllAngularProjects = (workspaceRootPath: string): AngularProject[] => {
	const angularJsonPath = join(workspaceRootPath, 'angular.json');
	const angularCliJsonPath = join(workspaceRootPath, '.angular-cli.json');

	let projects: AngularProject[] = [];
	if (existsSync(angularJsonPath)) {
		projects = mapAngularJsonObject(workspaceRootPath, angularJsonPath);
	} else if (existsSync(angularCliJsonPath)) {
		projects = mapAngularCliJsonObject(workspaceRootPath, angularCliJsonPath);
	} else {
		const error = 'No angular.json or angular-cli.json file found in root path.';
		window.showErrorMessage(error);
		throw new Error(error);
	}
	return projects;
};

const mapAngularCliJsonObject = (workspaceRootPath: string, angularCliJsonPath: any): AngularProject[] => {
	const angularJsonObject = JSON.parse(readFileSync(angularCliJsonPath, 'utf8'));

	const projects: AngularProject[] = [];
	for (const app of angularJsonObject.apps) {
		const appName = app.name || angularJsonObject.project.name;

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

const mapAngularJsonObject = (workspaceRootPath: string, angularJsonPath: any): AngularProject[] => {
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
