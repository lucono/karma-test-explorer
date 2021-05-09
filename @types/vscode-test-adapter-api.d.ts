import * as VSCodeTestAPI from "vscode-test-adapter-api";

declare module "vscode-test-adapter-api" {

  export interface TestSuiteFolderInfo extends TestSuiteInfo {
    suiteType: 'folder';
    path: string;
    children: (TestSuiteFolderInfo | TestSuiteInfo)[];
    file?: undefined;
    line?: undefined;
  }

  export interface TestSuiteInfo extends VSCodeTestAPI.TestSuiteInfo {
    suiteType: 'suite';
    fullName: string;
    testCount: number;
  }

  export interface TestInfo extends VSCodeTestAPI.TestInfo {
    fullName: string;
  }
}
