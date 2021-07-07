import { Logger } from './logger';
import * as vscode from 'vscode';
import { Disposable } from '../api/disposable';

export class Debugger implements Disposable {
	public constructor(private readonly logger: Logger) {}

	public async manageVSCodeDebuggingSession(workspace: any, debuggerConfig: any): Promise<void> {
		if (vscode.debug.activeDebugSession) {
			this.logger.debug(() => 'Not creating new debug session - Debug session already active');
			return;
		}

		const currentSession: vscode.DebugSession | undefined = await this.startDebuggingSession(workspace, debuggerConfig);

		if (!currentSession) {
			this.logger.error('Could not create debug session');
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

	private async startDebuggingSession(workspace: any, debuggerConfig: any) {
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(workspace.uri);
		await vscode.debug.startDebugging(workspaceFolder, debuggerConfig);
		await new Promise(resolve => setImmediate(resolve)); // workaround for Microsoft/vscode#70125

		const debugSession = vscode.debug.activeDebugSession;
		return debugSession;
	}

	public dispose() {
		this.logger.dispose();
	}
}
