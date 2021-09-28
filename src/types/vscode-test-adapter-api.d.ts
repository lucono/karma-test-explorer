import VSCodeTestAPI from 'vscode-test-adapter-api';

declare module 'vscode-test-adapter-api' {
  export interface TestSuiteInfo extends VSCodeTestAPI.TestSuiteInfo {
    fullName: string;
    testCount: number;
  }

  export interface TestInfo extends VSCodeTestAPI.TestInfo {
    fullName: string;
  }
}
