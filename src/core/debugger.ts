import { Logger } from './logger';
import * as vscode from 'vscode';
import { Disposable } from '../api/disposable';

export class Debugger implements Disposable {
	public constructor(private readonly logger: Logger) {}

	public async manageVSCodeDebuggingSession(workspace: any, debuggerConfig: any): Promise<void> {
		if (vscode.debug.activeDebugSession) {
			return;
		}

		let currentSession: vscode.DebugSession | undefined;

		currentSession = await this.startDebuggingSession(workspace, currentSession, debuggerConfig);
		if (!currentSession) {
			this.logger.error('No active debug session - aborting');
			return;
		}

		const subscription = vscode.debug.onDidTerminateDebugSession(session => {
			if (currentSession !== session) {
				return;
			}
			this.logger.info('Debug session ended');
			subscription.dispose();
		});
	}

	private async startDebuggingSession(
		workspace: any,
		currentSession: vscode.DebugSession | undefined,
		debuggerConfig: any
	) {
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(workspace.uri);
		await vscode.debug.startDebugging(workspaceFolder, debuggerConfig);
		await new Promise(resolve => setImmediate(resolve)); // workaround for Microsoft/vscode#70125
		currentSession = vscode.debug.activeDebugSession;
		return currentSession;
	}

	public dispose() {
		this.logger.dispose();
	}
}
