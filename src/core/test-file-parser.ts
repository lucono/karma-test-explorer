import { Disposable } from '../util/disposable/disposable';

export enum TestNodeType {
  Suite = 'Suite',
  Test = 'Test'
}

export interface TestNodeInfo {
  description: string;
  lineNumber: number | undefined;
}

export type TestSuiteFileInfo = Record<TestNodeType, TestNodeInfo[]>;

export interface TestFileParser extends Disposable {
  parseFileText(fileText: string): TestSuiteFileInfo;
}
