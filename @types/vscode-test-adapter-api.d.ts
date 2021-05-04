import * as VSCodeTestAPI from "vscode-test-adapter-api";

declare module "vscode-test-adapter-api" {

  // /**
  //  * Suitable for representing folders of test suites as a test suite.
  //  */
  // export interface TestSuiteCollectionInfo extends VSCodeTestAPI.TestSuiteInfo {
  //   type: 'suite';
  //   children: TestSuiteInfo[];
  //   file?: undefined;
  //   line?: undefined;
  // }

  export interface TestSuiteInfo extends VSCodeTestAPI.TestSuiteInfo {
    fullName: string;
    testCount: number
  }

  export interface TestInfo extends VSCodeTestAPI.TestInfo {
    fullName: string;
  }
}
