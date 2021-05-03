import * as VSCodeTestAPI from "vscode-test-adapter-api";

declare module "vscode-test-adapter-api" {

  export enum TestType {
    Suite = 'suite',
    Test = 'test'
  }

  /**
   * Suitable for representing folders of test suites as a test suite.
   */
  export interface TestSuiteCollectionInfo extends VSCodeTestAPI.TestSuiteInfo {
    type: TestType.Suite;
    children: TestSuiteInfo[];
    file?: undefined;
    line?: undefined;
  }

  export interface TestSuiteInfo extends VSCodeTestAPI.TestSuiteInfo {
    type: TestType.Suite;
    fullName: string;
  }

  export interface TestInfo extends VSCodeTestAPI.TestInfo {
    type: TestType.Test;
    fullName: string;
  }
}
