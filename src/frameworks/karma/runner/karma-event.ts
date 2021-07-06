import { TestRunStatus } from '../../jasmine/test-run-status';
import { LightSpecCompleteResponse } from './spec-complete-response';

export interface KarmaEvent {
	readonly name: string;
	readonly results?: LightSpecCompleteResponse;
	readonly runStatus?: TestRunStatus;
	readonly runInfo?: object;
	readonly browser?: BrowserInfo;
	readonly browsers?: BrowserInfo[];
	readonly info?: object;
	readonly error?: string;
}

export interface BrowserInfo {
	id: string;
	name: string;
	fullName: string;
}
