export interface AngularProject {
  readonly name: string;
  readonly rootPath: string;
  readonly karmaConfigPath: string;
  readonly isDefaultProject: boolean;
}
