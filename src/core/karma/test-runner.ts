import { TestSuiteInfo } from "vscode-test-adapter-api";
import { PathFinder } from "../helpers/path-finder";

export interface TestRunner {

  loadTests(pathFinder: PathFinder, karmaPort: number): Promise<TestSuiteInfo>;

  runTests(tests: string[], isComponentRun: boolean, karmaPort: number): Promise<void>;

  // isTestsRunning(): boolean;

  // stopRun(): any;

}
