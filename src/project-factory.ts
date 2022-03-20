import { existsSync } from 'fs';
import { basename, posix, resolve } from 'path';
import { workspace, WorkspaceConfiguration, WorkspaceFolder } from 'vscode';
import { EXTENSION_CONFIG_PREFIX, EXTENSION_NAME } from './constants';
import { ProjectType } from './core/base/project-type';
import { ConfigSetting, ExternalConfigSetting } from './core/config/config-setting';
import { SimpleMutableConfigStore } from './core/config/simple-mutable-config-store';
import { AngularProject } from './frameworks/angular/angular-project';
import { getAllAngularProjects, getDefaultAngularProject } from './frameworks/angular/angular-util';
import { Disposable } from './util/disposable/disposable';
import { Disposer } from './util/disposable/disposer';
import { Logger } from './util/logging/logger';
import { normalizePath } from './util/utils';
import { WorkspaceProject, WorkspaceType } from './workspace';

export class ProjectFactory implements Disposable {
  private readonly disposables: Disposable[] = [];

  public constructor(private readonly workspaceType: WorkspaceType, private readonly logger: Logger) {
    this.disposables.push(logger);
  }

  public createProjectsForWorkspaceFolders(...workspaceFolders: WorkspaceFolder[]): WorkspaceProject[] {
    const projects = workspaceFolders
      .map(workspaceFolder => this.createProjectsForWorkspaceFolder(workspaceFolder))
      .reduce((runningProjectList, currentFolderProjects) => [...runningProjectList, ...currentFolderProjects], []);

    return projects;
  }

  private createProjectsForWorkspaceFolder(workspaceFolder: WorkspaceFolder): WorkspaceProject[] {
    const folderConfig = workspace.getConfiguration(EXTENSION_CONFIG_PREFIX, workspaceFolder.uri);
    const workspaceFolderPath = normalizePath(workspaceFolder.uri.fsPath);
    const projectRootPath = normalizePath(
      resolve(workspaceFolderPath, folderConfig.get(ExternalConfigSetting.ProjectRootPath)!)
    );
    const projectType = folderConfig.get(ExternalConfigSetting.ProjectType);
    const defaultAngularProjectName = folderConfig.get<string>(ExternalConfigSetting.DefaultAngularProjectName)!;
    const projectFolderName = basename(projectRootPath);
    const shouldEnableAdapterForFolder = this.shouldActivateAdapterForWorkspaceFolder(
      workspaceFolderPath,
      folderConfig
    );

    if (workspaceFolder.uri.scheme !== 'file' || !shouldEnableAdapterForFolder) {
      this.logger.info(() => `Not enabling ${EXTENSION_NAME} for workspace folder: ${workspaceFolderPath}`);
      return [];
    }
    this.logger.info(() => `Enabling ${EXTENSION_NAME} for workspace folder: ${workspaceFolderPath}`);

    const angularProjects: AngularProject[] = getAllAngularProjects(projectRootPath);

    this.logger.debug(
      () =>
        `Angular projects found for workspace folder ${workspaceFolderPath}: ` +
        `${JSON.stringify(angularProjects.map(project => project.name))}`
    );

    const activeAngularProject = getDefaultAngularProject(projectRootPath, defaultAngularProjectName, angularProjects);

    this.logger.debug(
      () => `Active Angular project found for workspace folder ${workspaceFolderPath}: ${activeAngularProject?.name}`
    );

    const resolvedProjectType =
      projectType !== ProjectType.Karma && activeAngularProject !== undefined ? ProjectType.Angular : ProjectType.Karma;

    if (projectType === ProjectType.Angular && resolvedProjectType !== ProjectType.Angular) {
      this.logger.warn(
        () =>
          `Project type is configured as ${ProjectType.Angular} ` +
          `but no angular project configuration was found ` +
          `for workspace folder '${workspaceFolderPath}'`
      );
    }

    this.logger.info(
      () =>
        `Using ${resolvedProjectType} project type ` +
        `for workspace folder '${workspaceFolderPath}'` +
        `${!projectType ? ' (auto-detected)' : ''}`
    );

    const workspaceFolderProjects: WorkspaceProject[] = [];

    if (resolvedProjectType === ProjectType.Angular) {
      angularProjects.forEach(angularProject => {
        const projectNameSpace = this.workspaceType === WorkspaceType.MultiFolder ? `${projectFolderName}: ` : '';
        const angularProjectPath = normalizePath(resolve(projectRootPath, angularProject.rootPath));

        const projectConfig = new SimpleMutableConfigStore<ConfigSetting>(EXTENSION_CONFIG_PREFIX, {
          projectType: ProjectType.Angular,
          projectRootPath: projectRootPath,
          projectSubFolderPath: angularProjectPath,
          defaultAngularProjectName: angularProject.name
        });

        const project: WorkspaceProject = {
          name: `${projectNameSpace}${angularProject.name}`,
          workspaceFolder: workspaceFolder,
          workspaceFolderPath: workspaceFolderPath,
          config: projectConfig,
          isDefault: angularProject === activeAngularProject
        };
        workspaceFolderProjects.push(project);
      });
    } else {
      const projectConfig = new SimpleMutableConfigStore<ConfigSetting>(EXTENSION_CONFIG_PREFIX, {
        projectType: ProjectType.Karma,
        projectRootPath: projectRootPath,
        projectSubFolderPath: projectRootPath
      });

      const project: WorkspaceProject = {
        name: `${projectFolderName}`,
        workspaceFolder: workspaceFolder,
        workspaceFolderPath: workspaceFolderPath,
        config: projectConfig,
        isDefault: true
      };
      workspaceFolderProjects.push(project);
    }
    return workspaceFolderProjects;
  }

  private shouldActivateAdapterForWorkspaceFolder(
    workspaceFolderPath: string,
    config: WorkspaceConfiguration
  ): boolean {
    const enableExtension = config.get<boolean | null>(ExternalConfigSetting.EnableExtension);

    if (typeof enableExtension === 'boolean') {
      this.logger.debug(
        () =>
          `${enableExtension ? 'Activating' : 'Not activating'} adapter for ` +
          `workspace folder '${workspaceFolderPath}' because the extension has ` +
          `been explicitly ${enableExtension ? 'enabled' : 'disabled'} by setting ` +
          `the '${EXTENSION_CONFIG_PREFIX}.${ExternalConfigSetting.EnableExtension}' ` +
          `setting to ${enableExtension ? 'true' : 'false'}`
      );
      return enableExtension;
    }

    const configuredExtensionSetting = Object.values(ExternalConfigSetting).find(
      configSetting => config.inspect(configSetting)?.workspaceFolderValue ?? false
    );

    if (configuredExtensionSetting !== undefined) {
      this.logger.debug(
        () =>
          `Activating adapter for workspace folder '${workspaceFolderPath}' ` +
          `because it has one or more extension settings configured: ` +
          `${configuredExtensionSetting}`
      );
      return true;
    }

    const projectRootPath = config.get<string>(ExternalConfigSetting.ProjectRootPath) ?? '';
    const projectPackageJsonFilePath = posix.join(workspaceFolderPath, projectRootPath, 'package.json');
    const workspacePackageJsonFilePath = posix.join(workspaceFolderPath, 'package.json');

    let packageJsonFilePath: string | undefined;

    try {
      if (existsSync(projectPackageJsonFilePath)) {
        packageJsonFilePath = projectPackageJsonFilePath;
      }
    } catch (error) {
      this.logger.debug(() => `Could not find a project package.json file at ${projectPackageJsonFilePath}`);
    }

    try {
      if (!packageJsonFilePath && existsSync(workspacePackageJsonFilePath)) {
        packageJsonFilePath = workspacePackageJsonFilePath;
      }
    } catch (error) {
      this.logger.debug(() => `Could not find a workspace package.json file at ${workspacePackageJsonFilePath}`);
    }

    const packageJson: { devDependencies: Record<string, string> } | undefined = packageJsonFilePath
      ? require(projectPackageJsonFilePath)
      : undefined;

    if (packageJson && Object.keys(packageJson.devDependencies).includes('karma')) {
      this.logger.debug(
        () =>
          `Activating adapter for workspace folder '${workspaceFolderPath}' ` +
          `because related package.json file '${packageJsonFilePath}' has a karma dev dependency`
      );
      return true;
    }
    return false;
  }

  public async dispose(): Promise<void> {
    await Disposer.dispose(this.disposables);
  }
}
