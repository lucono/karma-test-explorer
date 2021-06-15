import { Disposable } from "../api/disposable";
import { TestStatus } from "../api/test-status";
import { Log } from "./log";
import { LogLevel } from "./log-level";

declare type LogAction = (...msg: any[]) => void;

export class Logger implements Disposable {

  public constructor(
    private readonly log: Log,
    private readonly loggerName: string,
    private readonly isDebugMode?: boolean)
  {}

  public debug(msgProvider: () => string, ...params: any[]) {
    if (!this.isDebugMode) {
      return;
    }
    const msg = msgProvider();
    const formattedMsg = this.formatMsg(msg, LogLevel.DEBUG);
    this.log.debug(formattedMsg);
    this.logParams(this.log.debug, params);
    global.console.log(formattedMsg);
  }

  public warn(msg: string, ...params: any[]) {
    const formattedMsg = this.formatMsg(msg, LogLevel.WARN);
    this.log.warn(formattedMsg);
    this.logParams(this.log.warn, params);
    global.console.log(formattedMsg);
  }

  public info(msg: string, ...params: any[]) {
    const formattedMsg = this.formatMsg(msg, LogLevel.INFO);
    this.log.info(formattedMsg);
    this.logParams(this.log.info, params);
    global.console.log(formattedMsg);
  }

  public error(msg: string, ...params: any[]) {
    const formattedMsg = this.formatMsg(msg, LogLevel.ERROR);
    this.log.error(formattedMsg);
    this.logParams(this.log.error, params);
    global.console.log(formattedMsg);
  }

  public status(testStatus: TestStatus) {  // FIXME: Remove in favor of the standard Log methods?
    let msg;
    if (testStatus === TestStatus.Success) {
      msg = `[SUCCESS] ✅ Passed`;
    } else if (testStatus === TestStatus.Failed) {
      msg = `[FAILURE] ❌ failed`;
    } else {
      msg = `[SKIPPED] Test Skipped`;
    }

    this.info(msg);
  }

  private logParams(logAction: LogAction, ...params: any[]) {
    const divider = params[0]?.divider as string | undefined;

    if (divider !== undefined) {
      logAction(`******************************* ${divider} *******************************`);
    }
  }

  private formatMsg(msg: string, logLevel: LogLevel): string {
    // const date = new Date();
    // return `[${date.toLocaleTimeString()}] [${this.loggerName}] ${logLevel.toUpperCase()}: ${msg}`;
    return `[${this.loggerName}]: ${msg}`;
  }
  
  public dispose(): void {
    // FIXME: Pending impl
  }
}
