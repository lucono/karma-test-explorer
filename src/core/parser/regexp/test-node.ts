import { TestDefinitionState } from '../../base/test-definition';

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
