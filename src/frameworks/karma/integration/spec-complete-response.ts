import { TestStatus } from "../../../api/test-status";

export interface SpecCompleteResponse {
    readonly id: string;
    readonly failureMessages: string[];
    readonly suite: string[];
    readonly description: string;
    readonly fullName: string;
    readonly status: TestStatus;
    readonly timeSpentInMilliseconds: string;
    readonly filePath?: string;
    readonly line?: number;
    // readonly fullResponse?: { [key: string]: any };
}

export type LightSpecCompleteResponse = Omit<SpecCompleteResponse, "fullName" | "fullResponse">;
