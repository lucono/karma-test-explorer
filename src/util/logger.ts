import { Log } from "vscode-test-adapter-util";
import { Disposable } from "../api/disposable";
import { TestStatus } from "../api/test-status";
import { LogLevel } from "../core/log-level";

declare type LogAction = (...msg: any[]) => void;

export type DebugLoggingResolver = () => boolean;

export class Logger implements Disposable {

  private readonly isDebugLoggingEnabled: DebugLoggingResolver;

  constructor(private readonly logger: Log, debugLoggingResolver?: DebugLoggingResolver) {
    this.isDebugLoggingEnabled = debugLoggingResolver ?? (() => false);
  }

  public debug(msgProvider: () => string, ...params: any[]) {
    if (!this.isDebugLoggingEnabled()) {
      return;
    }
    const msg = msgProvider();
    const formattedMsg = this.formatMsg(msg, LogLevel.DEBUG);
    this.logger.debug(formattedMsg);
    this.logParams(this.logger.debug, params);
    global.console.log(formattedMsg);
  };

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

  public status(testStatus: TestStatus) {
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
    const date = new Date();
    return `[${date.toLocaleTimeString()}] ${logLevel.toUpperCase()}: ${msg}`;
  }
  
  public dispose(): void {
    // FIXME: Pending impl
  }
}
