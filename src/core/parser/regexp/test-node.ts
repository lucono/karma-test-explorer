import { TestDefinitionState } from '../../base/test-definition.js';

export enum TestNodeType {
  Suite = 'Suite',
  Test = 'Test'
}

export interface TestNode {
  type: TestNodeType;
  description: string;
  state: TestDefinitionState;
  line: number;
}
