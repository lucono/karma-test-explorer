import { Execution } from "./execution";

export interface TestServerExecutor {

  executeServerStart(karmaPort: number, karmaSocketPort: number): Execution;
}
