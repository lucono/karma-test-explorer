import { Log as TestExplorerLog } from "vscode-test-adapter-util";
import { TestResult } from "../../model/enums/test-status.enum";
import { LogLevel } from "../../model/enums/log-level.enum";


type LogAction = (...msg: any[]) => void;

export class Logger {

  constructor(private readonly logger: TestExplorerLog) {}

  public debug(msg: string, ...params: any[]) {
    const formattedMsg = this.formatMsg(msg, LogLevel.DEBUG);
    this.logger.debug(formattedMsg);
    this.logParams(this.logger.debug, params);
    global.console.log(formattedMsg);
  }

  public warn(msg: string, ...params: any[]) {
    const formattedMsg = this.formatMsg(msg, LogLevel.WARN);
    this.logger.warn(formattedMsg);
    this.logParams(this.logger.warn, params);
    global.console.log(formattedMsg);
  }

  public info(msg: string, ...params: any[]) {
    const formattedMsg = this.formatMsg(msg, LogLevel.INFO);
    this.logger.info(formattedMsg);
    this.logParams(this.logger.info, params);
    global.console.log(formattedMsg);
  }

  public error(msg: string, ...params: any[]) {
    const formattedMsg = this.formatMsg(msg, LogLevel.ERROR);
    this.logger.error(formattedMsg);
    this.logParams(this.logger.error, params);
    global.console.log(formattedMsg);
  }

  public status(status: TestResult) {
    let msg;
    if (status === TestResult.Success) {
      msg = `[SUCCESS] ✅ Passed`;
    } else if (status === TestResult.Failed) {
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
    const date = new Date();
    return `[${date.toLocaleTimeString()}] ${logLevel.toUpperCase()}: ${msg}`;
  }
}
