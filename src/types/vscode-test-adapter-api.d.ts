import VSCodeTestAPI from 'vscode-test-adapter-api';

export type TestActiveState = 'default' | 'focused' | 'focusedIn' | 'disabled' | 'disabledOut';

declare module 'vscode-test-adapter-api' {
  export interface TestSuiteInfo extends VSCodeTestAPI.TestSuiteInfo {
    name: string;
    fullName: string;
    activeState: TestActiveState;
    testCount: number;
  }

  export interface TestInfo extends VSCodeTestAPI.TestInfo {
    name: string;
    fullName: string;
    activeState: TestActiveState;
  }
}
