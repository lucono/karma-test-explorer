import { TestStatus } from '../../../core/base/test-status';

export interface SpecCompleteResponse {
  readonly id: string;
  readonly failureMessages: string[];
  readonly suite: string[];
  readonly description: string;
  readonly fullName: string;
  readonly status: TestStatus;
  readonly timeSpentInMilliseconds: string;
}

export type LightSpecCompleteResponse = Omit<SpecCompleteResponse, 'fullName'>;
