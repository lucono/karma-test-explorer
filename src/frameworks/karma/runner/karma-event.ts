import { LightSpecCompleteResponse } from './spec-complete-response';
import { TestRunStatus } from './test-run-status';

export interface KarmaEvent {
  readonly name: KarmaEventName;
  readonly port?: number;
  readonly results?: LightSpecCompleteResponse;
  readonly runStatus?: TestRunStatus;
  readonly runInfo?: Record<string, unknown>;
  readonly browser?: BrowserInfo;
  readonly browsers?: BrowserInfo[];
  readonly info?: Record<string, unknown>;
  readonly error?: string;
  readonly logMessage?: string;
  readonly logLevel?: string;
  readonly data?: any;
}

export enum KarmaEventName {
  Listening = 'listening',
  Exit = 'exit',

  RunStart = 'run_start',
  SpecComplete = 'spec_complete',
  RunComplete = 'run_complete',

  BrowserRegister = 'browser_register',
  BrowsersChange = 'browsers_change',
  BrowsersReady = 'browsers_ready',
  BrowserStart = 'browser_start',
  BrowserComplete = 'browser_complete',
  BrowserInfo = 'browser_info',
  BrowserLog = 'browser_log',
  BrowserError = 'browser_error',
  BrowserProcessFailure = 'browser_process_failure',

  FileListModified = 'file_list_modified',
  BrowserCompleteWithNoMoreRetires = 'browser_complete_with_no_more_retries'
}

export interface BrowserInfo {
  id: string;
  name: string;
  fullName: string;
}
