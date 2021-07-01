import { OutputChannel } from 'vscode';
import { CommandLineProcessLog } from '../../../util/commandline-process-handler';

export class KarmaServerProcessLog implements CommandLineProcessLog {
	public constructor(private readonly logOutput: OutputChannel) {}

	public output(data: string) {
		this.logOutput.append(this.formatMessage(data));
	}

	public error(data: string) {
		const logMessage = this.formatMessage(data);
		this.output(`stderr: ${logMessage}`);
	}

	private formatMessage(data: string): string {
		const regex = new RegExp(/\(.*?)\m/, 'g');

		let log = data.toString().replace(regex, '');
		if (log.startsWith('e ')) {
			log = `HeadlessChrom${log}`;
		}
		return log;
	}
}
