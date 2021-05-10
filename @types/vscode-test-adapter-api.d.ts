import * as VSCodeTestAPI from "vscode-test-adapter-api";

declare module "vscode-test-adapter-api" {

  export interface TestFolderSuiteInfo extends TestSuiteInfo {
    suiteType: 'folder';
    path: string;
    children: (TestFolderSuiteInfo | TestFileSuiteInfo)[];
    file?: undefined;
    line?: undefined;
  }

  export interface TestFileSuiteInfo extends TestSuiteInfo {
    suiteType: 'file';
    file: string;
    // --------
    // children: TestSuiteInfo[];
  }

  export interface TestSuiteInfo extends VSCodeTestAPI.TestSuiteInfo {
    fullName: string;
    testCount: number;
  }

  export interface TestInfo extends VSCodeTestAPI.TestInfo {
    fullName: string;
  }
}
