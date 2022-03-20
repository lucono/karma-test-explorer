import { WorkspaceFolder } from 'vscode';
import { Adapter } from './adapter';
import { ConfigSetting } from './core/config/config-setting';
import { ConfigStore } from './core/config/config-store';

export interface WorkspaceProject {
  name: string;
  workspaceFolder: WorkspaceFolder;
  workspaceFolderPath: string;
  config: ConfigStore<ConfigSetting>;
  isDefault: boolean;
  adapter?: Adapter;
}

export enum WorkspaceType {
  SingleFolder = 'SingleFolder',
  MultiFolder = 'MultiFolder'
}
