import { TestStatus } from '../../../core/base/test-status';

export interface SpecCompleteResponse {
  readonly id: string;
  readonly failureMessages: string[];
  readonly suite: string[];
  readonly description: string;
  readonly fullName: string;
  readonly status: TestStatus;
  readonly timeSpentInMilliseconds: string;
  readonly filePath?: string; // FIXME: Is this ever sent from source?
  readonly line?: number; // FIXME: Is this ever sent from source?
}

export type LightSpecCompleteResponse = Omit<SpecCompleteResponse, 'fullName'>;
