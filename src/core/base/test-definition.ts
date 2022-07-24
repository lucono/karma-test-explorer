import { TestType } from './test-infos';

export enum TestDefinitionState {
  Default = 'default',
  Focused = 'focused',
  Disabled = 'disabled'
}

export interface TestDefinition {
  readonly type: TestType;
  readonly file: string;
  readonly line: number;
  readonly state: TestDefinitionState;
  readonly disabled: boolean;
}
