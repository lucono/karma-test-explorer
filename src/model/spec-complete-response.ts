import { TestResult } from "./enums/test-status.enum";

export class SpecCompleteResponse {
  public readonly id: string;
  public readonly failureMessages: string[];
  public readonly suite: string[];
  public readonly description: string;
  public readonly fullName: string;
  public readonly status: TestResult;
  public readonly timeSpentInMilliseconds: string;
  public readonly filePath?: string;
  public readonly line?: number;

  public constructor(
    _id: string,
    _failureMessages: string[],
    _suite: string[],
    _description: string,
    _fullName: string,
    _status: TestResult,
    _timeSpentInMilliseconds: string,
    _filePath?: string,
    _line?: number
  ) {
    this.id = _id;
    this.failureMessages = _failureMessages;
    this.suite = _suite;
    this.description = _description;
    this.fullName = _fullName;
    this.status = _status;
    this.timeSpentInMilliseconds = _timeSpentInMilliseconds;
    this.filePath = _filePath;
    this.line = _line;
  }
}
