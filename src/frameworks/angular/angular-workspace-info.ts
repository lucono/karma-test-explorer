import { DefaultCommand } from '../../workspace.js';
import { AngularProjectInfo } from './angular-project-info.js';

export interface AngularWorkspaceInfo {
  readonly projects: AngularProjectInfo[];
  readonly defaultProject?: AngularProjectInfo;
  readonly defaultCommand: DefaultCommand;
}
