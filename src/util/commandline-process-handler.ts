import { ChildProcess, SpawnOptions } from 'child_process';
import { Logger } from '../core/logger';
import { Execution } from '../api/execution';
import { generateRandomId } from './utils';
import * as spawn from 'cross-spawn';
import * as psTree from 'ps-tree';

export interface CommandLineProcessLog {
	output(data: string): void;
	error(data: string): void;
}

export class CommandLineProcessHandler {
	private readonly uid: string;
	private process: ChildProcess | undefined;
	private processExecution: Execution;
	private hasExited: boolean;
	private readonly processLog: CommandLineProcessLog;

	public constructor(
		command: string,
		processArguments: string[],
		private readonly logger: Logger,
		processLog?: CommandLineProcessLog,
		runOptions?: SpawnOptions
	) {
		this.uid = generateRandomId();
		this.hasExited = false;

		this.processLog = processLog ?? {
			output: logger.info.bind(logger),
			error: logger.error.bind(logger)
		};

		this.logger.debug(
			() =>
				`Process ${this.uid}:
      Executing command: '${command}'
      with args: ${JSON.stringify(processArguments)}
      and options: ${JSON.stringify(runOptions)}`
		);

		const process = spawn(command, processArguments, runOptions);
		const processPid = process.pid;

		this.logger.debug(
			() =>
				`Process ${this.uid}: \n` +
				`PID is ${processPid} for command: '${command}' \n` +
				`with args: ${JSON.stringify(processArguments)}`
		);

		this.process = process;
		this.setupProcessOutputs(process);

		const futureProcessExit: Promise<void> = new Promise(async resolve => {
			process.on('exit', (code, signal) => {
				const processCommand = `${command} ${processArguments.join(' ')}`;
				this.logger.debug(
					() =>
						`Process ${this.uid}: \n` +
						`PID ${processPid} exited \n` +
						`with code '${code}' and signal '${signal}' \n` +
						`for command: ${processCommand}`
				);

				this.updateProcessEnded();
				resolve();
			});
		});

		const processStartedPromise = Promise.resolve();

		const processExecution: Execution = {
			started: () => processStartedPromise,
			ended: () => futureProcessExit
		};

		this.processExecution = processExecution;
	}

	public async stop(): Promise<void> {
		if (!this.isProcessRunning()) {
			this.logger.info(`Process ${this.uid}: Request to kill process - Process already exited`);
			return;
		}

		const runningProcess = this.process as ChildProcess;
		this.logger.info(`Process ${this.uid}: Killing process tree of PID: ${runningProcess.pid}`);

		return new Promise<void>((resolve, reject) => {
			const processPid = runningProcess.pid;

			if (!processPid) {
				resolve();
				return;
			}

			psTree(processPid, (error, childProcesses) => {
				if (error) {
					this.logger.error(`Process ${this.uid}: Failed to kill process tree for PID '${processPid}': ${error}`);
					reject(error);
				} else {
					childProcesses.forEach(childProcess => process.kill(Number(childProcess.PID), 'SIGKILL'));
					this.logger.info(`Process ${this.uid}: Successfully killed process tree for PID: ${processPid}`);
					resolve();
				}
			});
		});
	}

	public execution(): Execution {
		return this.processExecution;
	}

	private isProcessRunning(): boolean {
		return !this.hasExited;
	}

	private updateProcessEnded() {
		this.hasExited = true;
	}

	private setupProcessOutputs(process: ChildProcess) {
		process.stdout?.on('data', (data: any) => this.processLog.output(`${data}`));
		process.stderr?.on(`data`, (data: any) => this.processLog.error(`${data}`));
		process.on(`error`, (error: any) => this.logger.error(`Process ${this.uid}: Error from child process: ${error}`));

		// Prevent karma server from being an orphan process if VSCODE is killed using SIGKILL
		process.stdin?.on(`close`, async () => {
			if (this.isProcessRunning()) {
				this.stop();
			}
		});
	}
}
