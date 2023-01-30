import { WorkspaceFolder } from 'vscode';

import { Adapter } from './adapter.js';
import { ProjectType } from './core/base/project-type.js';
import { ProjectConfigSetting } from './core/config/config-setting.js';
import { ConfigStore } from './core/config/config-store.js';

export interface WorkspaceProject {
  readonly shortName: string;
  readonly longName: string;
  readonly namespace: string;
  readonly type: ProjectType;
  readonly workspaceFolder: WorkspaceFolder;
  readonly workspaceFolderPath: string;
  readonly projectPath: string;
  readonly topLevelProjectPath: string;
  readonly shortProjectPath: string;
  readonly config: ConfigStore<ProjectConfigSetting>;
  readonly isPrimary: boolean;
  adapter?: Adapter;
}
