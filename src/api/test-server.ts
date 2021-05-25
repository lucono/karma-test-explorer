import { Disposable } from "./disposable";
import { Execution } from "./execution";

export interface TestServer extends Disposable {

  start(karmaPort: number, karmaSocketPort: number): Execution;

  stop(): Promise<void>;

  isRunning(): boolean;

  getServerPort(): number | undefined;
}