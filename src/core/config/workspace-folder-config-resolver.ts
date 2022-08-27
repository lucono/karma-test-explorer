import { WorkspaceFolder } from 'vscode';
import { ConfigStore } from './config-store';

export interface WorkspaceFolderConfigResolver<T extends string = string> {
  resolveConfig(workspaceFolder: WorkspaceFolder): ConfigStore<T>;
}
