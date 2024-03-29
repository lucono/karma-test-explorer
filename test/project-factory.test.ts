import { Uri, WorkspaceFolder } from 'vscode';

import { MockProxy, mock } from 'jest-mock-extended';

import { ProjectType } from '../src/core/base/project-type.js';
import { ExternalConfigSetting } from '../src/core/config/config-setting.js';
import { SimpleMutableConfigStore } from '../src/core/config/simple-mutable-config-store.js';
import { WorkspaceFolderConfigResolver } from '../src/core/config/workspace-folder-config-resolver.js';
import { ProjectFactory } from '../src/project-factory.js';
import { FileHandler } from '../src/util/filesystem/file-handler.js';
import { Logger } from '../src/util/logging/logger.js';
import { WorkspaceProject } from '../src/workspace.js';
import { Writeable } from './test-util.js';

describe('Project Factory', () => {
  let configStore: SimpleMutableConfigStore;
  let mockWorkspaceFolderConfigResolver: MockProxy<WorkspaceFolderConfigResolver>;
  let mockFileHandler: MockProxy<FileHandler>;
  let projectFactory: ProjectFactory;

  beforeEach(() => {
    configStore = new SimpleMutableConfigStore({ [ExternalConfigSetting.EnableExtension]: true });

    mockWorkspaceFolderConfigResolver = mock<WorkspaceFolderConfigResolver>();
    mockWorkspaceFolderConfigResolver.resolveConfig.mockImplementation(() => configStore);
    mockFileHandler = mock<FileHandler>();
    projectFactory = new ProjectFactory(mockFileHandler, mockWorkspaceFolderConfigResolver, mock<Logger>());
  });

  describe('createProjectsForWorkspaceFolders method', () => {
    let mockWorkspaceFolder: WorkspaceFolder;
    let mockWorkspaceFolderFsPath: string;

    beforeEach(() => {
      configStore.set(ExternalConfigSetting.EnableExtension, true);
      configStore.set(ExternalConfigSetting.KarmaConfFilePath, '');

      mockWorkspaceFolderFsPath =
        process.platform === 'win32' ? 'C:/fake/workspace/project' : '/fake/workspace/project';

      mockWorkspaceFolder = mock<WorkspaceFolder>();
      (mockWorkspaceFolder.uri as Writeable<Uri>).fsPath = mockWorkspaceFolderFsPath;
      mockFileHandler.existsSync.calledWith(mockWorkspaceFolderFsPath).mockReturnValue(true);
    });

    describe('using a non-file scheme uri workspace', () => {
      beforeEach(() => {
        (mockWorkspaceFolder.uri as Writeable<Uri>).scheme = 'not-file-scheme';
      });

      it('does not create a project for the workspace', () => {
        const projects = projectFactory.createProjectsForWorkspaceFolders(mockWorkspaceFolder);
        expect(projects).toEqual([]);
      });
    });

    describe('using a file scheme uri workspace', () => {
      beforeEach(() => {
        (mockWorkspaceFolder.uri as Writeable<Uri>).scheme = 'file';
      });

      it('creates a project for the workspace', () => {
        const projects = projectFactory.createProjectsForWorkspaceFolders(mockWorkspaceFolder);

        expect(projects).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: ProjectType.Karma,
              shortName: 'project',
              longName: 'project',
              namespace: mockWorkspaceFolderFsPath,
              workspaceFolder: mockWorkspaceFolder,
              workspaceFolderPath: mockWorkspaceFolderFsPath,
              shortProjectPath: '',
              topLevelProjectPath: mockWorkspaceFolderFsPath,
              projectPath: mockWorkspaceFolderFsPath,
              isPrimary: true
            } as WorkspaceProject)
          ])
        );
      });
    });
  });
});
