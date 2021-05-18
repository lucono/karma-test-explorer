import * as VSCodeTestAPI from "vscode-test-adapter-api";

declare module "vscode-test-adapter-api" {

  export interface TestFolderSuiteInfo extends TestSuiteInfo {
    suiteType: 'folder';
    path: string;
    fullName: '';
    // parent?: TestFolderSuiteInfo | undefined;
    children: (TestFolderSuiteInfo | TestFileSuiteInfo)[];
    file?: undefined;
    line?: undefined;
  }

  export interface TestFileSuiteInfo extends TestSuiteInfo {
    suiteType: 'file';
    // parent?: TestFolderSuiteInfo | TestFileSuiteInfo;
    file: string;
    // --------
    // children: TestSuiteInfo[];
  }

  export interface TestSuiteInfo extends VSCodeTestAPI.TestSuiteInfo {
    fullName: string;
    // parent?: TestSuiteInfo | TestFileSuiteInfo;
    testCount: number;
  }

  export interface TestInfo extends VSCodeTestAPI.TestInfo {
    fullName: string;
    // parent: TestSuiteInfo;
  }

  export type AnyTestInfo = TestInfo | TestSuiteInfo | TestFileSuiteInfo | TestFolderSuiteInfo;
}
