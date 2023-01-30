import { DebugConfiguration, DebugSession, WorkspaceFolder, debug } from 'vscode';

import { Disposable } from '../util/disposable/disposable.js';
import { Disposer } from '../util/disposable/disposer.js';
import { DeferredExecution } from '../util/future/deferred-execution.js';
import { Execution } from '../util/future/execution.js';
import { Logger } from '../util/logging/logger.js';

export interface DebuggerOptions {
  readonly debuggerNamespace?: string;
}

export class Debugger implements Disposable {
  private activeDebugSession?: DebugSession;

  public constructor(private readonly logger: Logger, private readonly options?: DebuggerOptions) {}

  public startDebugSession(
    workspaceFolder: WorkspaceFolder,
    debuggerNameOrConfig: string | DebugConfiguration,
    sessionStartTimeout: number
  ): Execution<DebugSession> {
    const deferredDebugSessionExecution: DeferredExecution<DebugSession> = new DeferredExecution();
    const debugSessionExecution = deferredDebugSessionExecution.execution();
    const debuggerNamespaceTag = this.options?.debuggerNamespace ? ` - ${this.options?.debuggerNamespace}` : '';

    const actualDebuggerNameOrConfig =
      typeof debuggerNameOrConfig === 'string'
        ? debuggerNameOrConfig
        : { ...debuggerNameOrConfig, name: `${debuggerNameOrConfig.name}${debuggerNamespaceTag}` };

    const debuggerConfigName =
      typeof actualDebuggerNameOrConfig === 'string' ? actualDebuggerNameOrConfig : actualDebuggerNameOrConfig.name;

    try {
      const activeDebugSession = debug.activeDebugSession;

      if (activeDebugSession && activeDebugSession.name === debuggerConfigName) {
        this.logger.info(() => `Debug session '${activeDebugSession.name}' is alredy active`);
        deferredDebugSessionExecution.start(activeDebugSession);
        this.activeDebugSession = activeDebugSession;
      } else {
        const debugStartSubscription: Disposable = debug.onDidStartDebugSession(session => {
          if (session.name === debuggerConfigName) {
            this.logger.info(() => `Debug session '${session.name}' has started`);
            deferredDebugSessionExecution.start(session);
            this.activeDebugSession = session;
          }
        });

        debugSessionExecution.started().finally(() => debugStartSubscription.dispose());

        debug.startDebugging(workspaceFolder, actualDebuggerNameOrConfig).then(
          isSessionStarted => {
            if (!isSessionStarted) {
              deferredDebugSessionExecution.fail(`Debug session '${debuggerConfigName}' failed to start`);
            }
          },
          reason =>
            deferredDebugSessionExecution.fail(
              `Debug session '${debuggerConfigName}' failed to start: ${reason.message ?? reason}`
            )
        );

        deferredDebugSessionExecution.failIfNotStarted(
          sessionStartTimeout,
          `Timeout after waiting ${sessionStartTimeout} ms for debug session '${debuggerConfigName}' to start`
        );
      }

      debugSessionExecution.started().then(debugSession => {
        const debugStopSubscription = debug.onDidTerminateDebugSession(session => {
          if (session === debugSession) {
            this.logger.info(() => `Debug session '${session.name}' has ended`);
            deferredDebugSessionExecution.end();
            this.activeDebugSession = undefined;
            debugStopSubscription.dispose();
          }
        });
      });
    } catch (error) {
      deferredDebugSessionExecution.fail(`Debug session '${debuggerConfigName}' failed to start: ${error}`);
    }

    return debugSessionExecution;
  }

  public isDebugging() {
    return this.activeDebugSession !== undefined;
  }

  public async dispose() {
    if (this.activeDebugSession) {
      debug.stopDebugging(this.activeDebugSession);
    }

    await Disposer.dispose(this.logger);
  }
}
