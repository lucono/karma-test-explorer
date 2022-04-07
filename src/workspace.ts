import { WorkspaceFolder } from 'vscode';
import { Adapter } from './adapter';
import { ProjectType } from './core/base/project-type';
import { ConfigSetting } from './core/config/config-setting';
import { ConfigStore } from './core/config/config-store';

export interface WorkspaceProject {
  readonly name: string;
  readonly displayName: string;
  readonly type: ProjectType;
  readonly workspaceFolder: WorkspaceFolder;
  readonly workspaceFolderPath: string;
  readonly projectPath: string;
  readonly shortProjectPath: string;
  readonly config: ConfigStore<ConfigSetting>;
  readonly isDefault: boolean;
  adapter?: Adapter;
}

export enum WorkspaceType {
  SingleFolder = 'SingleFolder',
  MultiFolder = 'MultiFolder'
}
