import { AngularProjectInfo } from './angular-project-info';

export interface AngularWorkspaceInfo {
  readonly projects: AngularProjectInfo[];
  readonly defaultProject?: AngularProjectInfo;
}
