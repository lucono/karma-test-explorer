import { Execution } from './execution';

export interface TestServerExecutor {
	executeServerStart(karmaPort: number, karmaSocketPort: number): Execution<ServerStopExecutor>;
}

export interface ServerStopExecutor {
	executeServerStop(): Promise<void>;
}
