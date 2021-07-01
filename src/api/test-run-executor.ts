import { Execution } from './execution';

export interface TestRunExecutor {
	executeTestRun(karmaPort: number, clientArgs: string[]): Execution;
}
