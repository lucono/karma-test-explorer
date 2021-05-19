import { Execution } from "./execution";

export interface TestServer {

  start(karmaPort: number, karmaSocketPort: number): Execution;

  stop(): Promise<void>;

  isRunning(): boolean;

  getServerPort(): number | undefined;

}