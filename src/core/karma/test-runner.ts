import { TestExplorerConfiguration } from "../../model/test-explorer-configuration";
import { TestSuiteInfo } from "vscode-test-adapter-api";
import { PathFinder } from "../helpers/path-finder";

export interface TestRunner {

  loadTests(config: TestExplorerConfiguration, pathFinder: PathFinder): Promise<TestSuiteInfo>;

  runTests(tests: string[], config: TestExplorerConfiguration, isComponentRun: boolean): Promise<void>;

  // isTestsRunning(): boolean;

  // stopRun(): any;

}
