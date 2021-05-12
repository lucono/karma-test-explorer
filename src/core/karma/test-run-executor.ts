import { TestExplorerConfiguration } from "../../model/test-explorer-configuration";

export interface KarmaRunConfig {
  port: number;
  clientArgs: string[];
  refresh?: boolean;
  urlRoot?: string;
  hostname?: string;
}
  
export interface TestRunExecutor {

  executeTestRun(karmaRunConfig: KarmaRunConfig, explorerConfig: TestExplorerConfiguration): Promise<void>;
}
