import { mock, MockProxy } from 'jest-mock-extended';
import { Uri, WorkspaceFolder } from 'vscode';
import { ExternalConfigSetting } from '../src/core/config/config-setting';
import { SimpleMutableConfigStore } from '../src/core/config/simple-mutable-config-store';
import { WorkspaceFolderConfigResolver } from '../src/core/config/workspace-folder-config-resolver';
import { ProjectFactory } from '../src/project-factory';
import { FileHandler } from '../src/util/filesystem/file-handler';
import { Logger } from '../src/util/logging/logger';
import { Writeable } from './test-util';

describe('Project Factory', () => {
  let configStore: SimpleMutableConfigStore;
  let mockWorkspaceFolderConfigResolver: MockProxy<WorkspaceFolderConfigResolver>;
  let mockFileHandler: MockProxy<FileHandler>;
  let projectFactory: ProjectFactory;

  beforeEach(() => {
    configStore = new SimpleMutableConfigStore(undefined, { [ExternalConfigSetting.EnableExtension]: true });
    mockWorkspaceFolderConfigResolver = mock<WorkspaceFolderConfigResolver>();
    mockWorkspaceFolderConfigResolver.resolveConfig.mockImplementation(() => configStore);
    mockFileHandler = mock<FileHandler>();
    projectFactory = new ProjectFactory(mockFileHandler, mockWorkspaceFolderConfigResolver, mock<Logger>());
  });

  describe('createProjectsForWorkspaceFolders method', () => {
    let workspaceFolder: WorkspaceFolder;

    beforeEach(() => {
      workspaceFolder = mock<WorkspaceFolder>();
    });

    describe('using a non-file scheme uri workspace', () => {
      beforeEach(() => {
        (workspaceFolder.uri as Writeable<Uri>).scheme = 'not-file-scheme';
      });

      it('does not create a project for the workspace', () => {
        const projects = projectFactory.createProjectsForWorkspaceFolders(workspaceFolder);
        expect(projects).toEqual([]);
      });
    });

    describe('using a file scheme uri workspace', () => {
      beforeEach(() => {
        (workspaceFolder.uri as Writeable<Uri>).scheme = 'file';
        (workspaceFolder.uri as Writeable<Uri>).fsPath = '/fake/workspace/path';
      });

      it('creates a project for the workspace', () => {
        const projects = projectFactory.createProjectsForWorkspaceFolders(workspaceFolder);
        expect(projects).toEqual([]);
      });
    });
  });
});
