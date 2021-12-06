import { TestDefinitionState } from './test-definition';

export enum TestNodeType {
  Suite = 'Suite',
  Test = 'Test'
}

export interface TestNode {
  type: TestNodeType;
  state: TestDefinitionState;
  description: string;
  line: number;
}
