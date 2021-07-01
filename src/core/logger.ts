import { Disposable } from '../api/disposable';
import { Log } from './log';
import { LogLevel } from './log-level';

declare type LogAction = (...msg: any[]) => void;

export class Logger implements Disposable {
	public constructor(
		private readonly log: Log,
		private readonly loggerName: string,
		private readonly isDebugMode?: boolean
	) {}

	public debug(msgProvider: () => string) {
		if (!this.isDebugMode) {
			return;
		}
		const msg = msgProvider();
		const formattedMsg = this.formatMsg(msg, LogLevel.DEBUG);
		this.log.debug(formattedMsg);
		global.console.log(formattedMsg);
	}

	public warn(msg: string) {
		const formattedMsg = this.formatMsg(msg, LogLevel.WARN);
		this.log.warn(formattedMsg);
		global.console.log(formattedMsg);
	}

	public info(msg: string) {
		const formattedMsg = this.formatMsg(msg, LogLevel.INFO);
		this.log.info(formattedMsg);
		global.console.log(formattedMsg);
	}

	public error(msg: string) {
		const formattedMsg = this.formatMsg(msg, LogLevel.ERROR);
		this.log.error(formattedMsg);
		global.console.log(formattedMsg);
	}

	private formatMsg(msg: string, logLevel: LogLevel): string {
		return `[${this.loggerName}]: ${msg}`;
	}

	public dispose(): void {}
}
