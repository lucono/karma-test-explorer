import { TestInfo, TestSuiteInfo } from 'vscode-test-adapter-api';
import { SpecCompleteResponse } from './spec-complete-response';

export interface TestBuilder {
  buildTests(specs: SpecCompleteResponse[]): (TestInfo | TestSuiteInfo)[];
}
