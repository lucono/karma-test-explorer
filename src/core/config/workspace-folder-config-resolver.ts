import { WorkspaceFolder } from 'vscode';

import { ConfigStore } from './config-store.js';

export interface WorkspaceFolderConfigResolver<T extends string = string> {
  resolveConfig(workspaceFolder: WorkspaceFolder): ConfigStore<T>;
}
