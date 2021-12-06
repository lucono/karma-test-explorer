import { TestInfo, TestSuiteInfo } from 'vscode-test-adapter-api';

export enum TestType {
  Suite = 'suite',
  Test = 'test'
}

export enum TestSuiteType {
  File = 'file',
  Folder = 'folder'
}

export interface TestFolderSuiteInfo extends TestSuiteInfo {
  suiteType: TestSuiteType.Folder;
  path: string;
  name: string;
  fullName: '';
  children: (TestFolderSuiteInfo | TestFileSuiteInfo)[];
  file?: undefined;
  line?: undefined;
}

export interface TestFileSuiteInfo extends TestSuiteInfo {
  suiteType: TestSuiteType.File;
  file: string;
}

export type AnyTestInfo = TestInfo | TestSuiteInfo | TestFileSuiteInfo | TestFolderSuiteInfo;
