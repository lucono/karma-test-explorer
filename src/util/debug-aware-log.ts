import { Log } from "../core/log"

export class DebugAwareLog {

  public constructor(
    private readonly log: Log,
    private readonly isDebugMode: boolean)
  {}

  public info(msg: string) {
    this.log.info(msg);
  }

  public warn(msg: string) {
    this.log.warn(msg);
  }

  public error(msg: string) {
    this.log.error(msg);
  }

  public debug(msg: () => string) {
    if (this.isDebugMode) {
      this.log.debug(msg());
    }
  }
}
