import { TestResult } from "./enums/test-status.enum";

export interface SpecCompleteResponse {
    readonly id: string;
    readonly failureMessages: string[];
    readonly suite: string[];
    readonly description: string;
    readonly fullName: string;
    readonly status: TestResult;
    readonly timeSpentInMilliseconds: string;
    readonly filePath?: string;
    readonly line?: number;
    readonly fullResponse?: { [key: string]: any };
}
