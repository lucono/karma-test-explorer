import { existsSync } from 'fs';
import { basename, posix, relative, resolve } from 'path';
import type { PackageJson } from 'type-fest';
import { workspace, WorkspaceFolder } from 'vscode';
import { EXTENSION_CONFIG_PREFIX, EXTENSION_NAME } from './constants';
import { ProjectType } from './core/base/project-type';
import {
  ExternalConfigSetting,
  GeneralConfigSetting,
  InternalConfigSetting,
  ProjectConfigSetting,
  WorkspaceConfigSetting
} from './core/config/config-setting';
import { ConfigStore } from './core/config/config-store';
import { LayeredConfigStore } from './core/config/layered-config-store';
import { ProjectSpecificConfig, ProjectSpecificConfigSetting } from './core/config/project-specific-config';
import { SimpleConfigStore } from './core/config/simple-config-store';
import { getAngularWorkspaceInfo } from './frameworks/angular/angular-util';
import { AngularWorkspaceInfo } from './frameworks/angular/angular-workspace-info';
import { Disposable } from './util/disposable/disposable';
import { Disposer } from './util/disposable/disposer';
import { Logger } from './util/logging/logger';
import { asNonBlankStringOrUndefined, getPackageJsonAtPath, isChildPath, normalizePath } from './util/utils';
import { WorkspaceProject } from './workspace';

export class ProjectFactory implements Disposable {
  private readonly disposables: Disposable[] = [];

  public constructor(private readonly logger: Logger) {
    this.disposables.push(logger);
  }

  public createProjectsForWorkspaceFolders(...workspaceFolders: WorkspaceFolder[]): WorkspaceProject[] {
    const projects = workspaceFolders
      .map(workspaceFolder => this.createProjectsForWorkspaceFolder(workspaceFolder))
      .reduce((runningProjectList, currentFolderProjects) => [...runningProjectList, ...currentFolderProjects], []);

    return projects;
  }

  private createProjectsForWorkspaceFolder(workspaceFolder: WorkspaceFolder): WorkspaceProject[] {
    this.logger.debug(() => `Inspecting workspace folder for testing: ${workspaceFolder.uri.fsPath}`);

    if (workspaceFolder.uri.scheme !== 'file') {
      this.logger.debug(() => `Excluding projects in non-file scheme workspace folder: ${workspaceFolder.uri.fsPath}`);
      return [];
    }
    const workspaceFolderPath = normalizePath(workspaceFolder.uri.fsPath);
    const workspaceConfig = workspace.getConfiguration(EXTENSION_CONFIG_PREFIX, workspaceFolder);

    const shouldEnableTestingForWorkspaceFolder = this.shouldEnableTestingForWorkspaceFolder(
      workspaceFolderPath,
      workspaceConfig
    );

    if (!shouldEnableTestingForWorkspaceFolder) {
      this.logger.debug(
        () =>
          `Excluding projects in workspace folder - ` +
          `None of the inclusion conditions were satisfied: ${workspaceFolderPath}`
      );
      return [];
    }
    this.logger.debug(
      () =>
        `Including projects in workspace folder - ` +
        `One or more inclusion conditions were satisfied: ${workspaceFolderPath}`
    );

    let configuredProjects: (string | ProjectSpecificConfig)[] =
      workspaceConfig.get(ExternalConfigSetting.Projects) ?? [];

    if (configuredProjects.length === 0) {
      const deprecatedProjectRootPath = asNonBlankStringOrUndefined(
        workspaceConfig.get(ExternalConfigSetting.ProjectRootPath)
      );
      configuredProjects = deprecatedProjectRootPath ? [deprecatedProjectRootPath] : [''];
    }

    const workspaceFolderProjects = configuredProjects
      .map(configuredProject => {
        const projectSpecificSettings =
          typeof configuredProject === 'string'
            ? { [ExternalConfigSetting.ProjectRootPath]: configuredProject }
            : configuredProject;

        const projectSpecificConfig: ConfigStore<ProjectSpecificConfigSetting> = new SimpleConfigStore(
          projectSpecificSettings,
          EXTENSION_CONFIG_PREFIX
        );

        const projectFolderConfig: ConfigStore<WorkspaceConfigSetting> = new LayeredConfigStore(
          workspaceConfig,
          projectSpecificConfig
        );

        return this.createProjectsForConfiguredProjectFolder(projectFolderConfig, workspaceFolder);
      })
      .reduce((previousProjects, newProjects) => [...previousProjects, ...newProjects], []);

    return workspaceFolderProjects;
  }

  private createProjectsForConfiguredProjectFolder(
    projectFolderConfig: ConfigStore<WorkspaceConfigSetting>,
    workspaceFolder: WorkspaceFolder // FIXME: Can this be reduced to workspace folder path string?
  ): WorkspaceProject[] {
    const workspaceFolderPath = normalizePath(workspaceFolder.uri.fsPath);
    const relativeProjectRootPath = projectFolderConfig.get<string>(ExternalConfigSetting.ProjectRootPath);
    const absoluteProjectRootPath = normalizePath(resolve(workspaceFolderPath, relativeProjectRootPath));
    const isProjectPathInWorkspaceFolder = isChildPath(workspaceFolderPath, absoluteProjectRootPath, true);

    if (!isProjectPathInWorkspaceFolder) {
      this.logger.debug(
        () =>
          `Excluding project root path '${relativeProjectRootPath}' ` +
          `which has absolute path '${absoluteProjectRootPath}' - ` +
          `Path is not under the workspace folder path '${workspaceFolderPath}'`
      );
      return [];
    }

    if (!existsSync(absoluteProjectRootPath)) {
      this.logger.debug(
        () =>
          `Excluding project root path '${relativeProjectRootPath}' ` +
          `which has absolute path '${absoluteProjectRootPath}' - ` +
          `Path does not exist`
      );
      return [];
    }

    const projectRootPathFolderName = basename(absoluteProjectRootPath);
    const projectType: ProjectType | undefined = projectFolderConfig.get(ExternalConfigSetting.ProjectType);

    const angularWorkspace: AngularWorkspaceInfo | undefined = getAngularWorkspaceInfo(
      absoluteProjectRootPath,
      this.logger
    );

    if (projectType === ProjectType.Angular && !angularWorkspace) {
      this.logger.warn(
        () =>
          `Project type is configured as ${ProjectType.Angular} ` +
          `but no viable angular projects were found ` +
          `for workspace folder '${workspaceFolderPath}'`
      );
    }

    const isAngularProject = angularWorkspace && projectType !== ProjectType.Karma;

    this.logger.info(
      () =>
        `Using project type '${isAngularProject ? ProjectType.Angular : ProjectType.Karma}' ` +
        `${!projectType ? '(auto-detected)' : ''} for workspace folder: ${workspaceFolderPath}`
    );

    const workspaceFolderProjects: WorkspaceProject[] = [];

    if (isAngularProject) {
      if (angularWorkspace.projects.length === 0) {
        this.logger.warn(() => `No projects found for Angular workspace: ${absoluteProjectRootPath}`);
        return [];
      }
      this.logger.debug(
        () =>
          `Angular projects found for workspace folder '${workspaceFolderPath}': ` +
          `${angularWorkspace.projects.map(projectInfo => projectInfo.name).join(', ')}`
      );

      angularWorkspace.projects.forEach(angularChildProjectInfo => {
        const angularProjectPath = normalizePath(resolve(absoluteProjectRootPath, angularChildProjectInfo.rootPath));
        const karmaConfigPath = normalizePath(resolve(angularProjectPath, angularChildProjectInfo.karmaConfigPath));

        const projectInternalSettings = new SimpleConfigStore<InternalConfigSetting>(
          {
            [InternalConfigSetting.ProjectType]: ProjectType.Angular,
            [InternalConfigSetting.ProjectName]: angularChildProjectInfo.name,
            [InternalConfigSetting.ProjectPath]: angularProjectPath,
            [InternalConfigSetting.ProjectInstallRootPath]: absoluteProjectRootPath,
            [InternalConfigSetting.ProjectKarmaConfigFilePath]: karmaConfigPath
          },
          EXTENSION_CONFIG_PREFIX
        );

        const angularChildProjectConfig: ConfigStore<ProjectConfigSetting> = new LayeredConfigStore(
          projectFolderConfig,
          projectInternalSettings
        );

        const project: WorkspaceProject = {
          shortName: angularChildProjectInfo.name,
          longName: `${projectRootPathFolderName}: ${angularChildProjectInfo.name}`,
          namespace: `${absoluteProjectRootPath}:${angularChildProjectInfo.name}`,
          type: ProjectType.Angular,
          workspaceFolder: workspaceFolder, // FIXME: Exclude? Could only workspace folder path be enough?
          workspaceFolderPath: workspaceFolderPath,
          projectPath: angularProjectPath,
          topLevelProjectPath: absoluteProjectRootPath,
          shortProjectPath: relative(workspaceFolderPath, angularProjectPath),
          config: angularChildProjectConfig,
          isPrimary: angularWorkspace.defaultProject
            ? angularChildProjectInfo.name === angularWorkspace.defaultProject.name
            : false
        };
        workspaceFolderProjects.push(project);
      });
    } else {
      const karmaConfigPath = normalizePath(
        resolve(absoluteProjectRootPath, projectFolderConfig.get(ExternalConfigSetting.KarmaConfFilePath)!)
      );
      const projectInternalSettings = new SimpleConfigStore<InternalConfigSetting>(
        {
          [InternalConfigSetting.ProjectType]: ProjectType.Karma,
          [InternalConfigSetting.ProjectName]: projectRootPathFolderName,
          [InternalConfigSetting.ProjectPath]: absoluteProjectRootPath,
          [InternalConfigSetting.ProjectInstallRootPath]: absoluteProjectRootPath,
          [InternalConfigSetting.ProjectKarmaConfigFilePath]: karmaConfigPath
        },
        EXTENSION_CONFIG_PREFIX
      );

      const projectConfig: ConfigStore<ProjectConfigSetting> = new LayeredConfigStore(
        projectFolderConfig,
        projectInternalSettings
      );

      const project: WorkspaceProject = {
        shortName: projectRootPathFolderName,
        longName: projectRootPathFolderName,
        namespace: absoluteProjectRootPath,
        type: ProjectType.Karma,
        workspaceFolder: workspaceFolder,
        workspaceFolderPath: workspaceFolderPath,
        projectPath: absoluteProjectRootPath,
        topLevelProjectPath: absoluteProjectRootPath,
        shortProjectPath: relative(workspaceFolderPath, absoluteProjectRootPath),
        config: projectConfig,
        isPrimary: true
      };
      workspaceFolderProjects.push(project);
    }
    workspaceFolderProjects.sort((project1, project2) =>
      project1.longName.toLocaleLowerCase().localeCompare(project2.longName.toLocaleLowerCase())
    );
    return workspaceFolderProjects;
  }

  private shouldEnableTestingForWorkspaceFolder(
    workspaceFolderPath: string,
    workspaceConfig: ConfigStore<WorkspaceConfigSetting>
  ): boolean {
    const enableExtension = workspaceConfig.get<boolean | null>(ExternalConfigSetting.EnableExtension);

    if (typeof enableExtension === 'boolean') {
      this.logger.debug(
        () =>
          `${enableExtension ? 'Including' : 'Excluding'} projects ` +
          `in workspace folder '${workspaceFolderPath}' - ` +
          `'${EXTENSION_CONFIG_PREFIX}.${ExternalConfigSetting.EnableExtension}' ` +
          `is set to ${enableExtension}`
      );
      return enableExtension;
    } else {
      this.logger.debug(
        () =>
          `Workspace folder '${workspaceFolderPath}' ` +
          `does not explicitly enable or disable testing with the ` +
          `'${EXTENSION_CONFIG_PREFIX}.${ExternalConfigSetting.EnableExtension}' ` +
          `extension setting`
      );
    }

    const configuredExtensionSetting = [
      ...Object.values(GeneralConfigSetting),
      ...Object.values(ExternalConfigSetting)
    ].find(configSetting => workspaceConfig.inspect(configSetting)?.workspaceFolderValue ?? false);

    if (configuredExtensionSetting !== undefined) {
      this.logger.debug(
        () =>
          `Including projects in workspace folder '${workspaceFolderPath}' ` +
          `because it has one or more extension settings configured: ` +
          `${configuredExtensionSetting}`
      );
      return true;
    } else {
      this.logger.debug(() => `Workspace folder '${workspaceFolderPath}' has no ${EXTENSION_NAME} settings configured`);
    }

    const workspacePackageJsonFilePath = posix.join(workspaceFolderPath, 'package.json');
    const packageJson: PackageJson | undefined = getPackageJsonAtPath(workspacePackageJsonFilePath, this.logger);

    if (!packageJson) {
      this.logger.debug(
        () =>
          `Excluding projects in workspace folder '${workspaceFolderPath}' ` +
          `because could not determine presence of a testable project - ` +
          `No package.json file at: '${workspacePackageJsonFilePath}'`
      );
      return false;
    } else {
      this.logger.debug(() => `Found a workspace package.json file at '${workspacePackageJsonFilePath}'`);
    }

    if (packageJson.devDependencies?.karma) {
      this.logger.debug(
        () =>
          `Including projects in workspace folder '${workspaceFolderPath}' ` +
          `because workspace package.json file '${workspacePackageJsonFilePath}' ` +
          `includes a karma dev dependency`
      );
      return true;
    } else {
      this.logger.debug(
        () => `Could not confirm karma dev dependency in workspace package.json file '${workspacePackageJsonFilePath}'`
      );
    }

    this.logger.debug(
      () =>
        `Excluding projects in workspace folder '${workspaceFolderPath}' - ` +
        `None of the activation conditions could be confirmed for the workspace`
    );
    return false;
  }

  public async dispose(): Promise<void> {
    await Disposer.dispose(this.disposables);
  }
}
