import { commands } from 'vscode';
import { Disposable } from '../../../util/disposable/disposable';
import { Disposer } from '../../../util/disposable/disposer';
import { Logger } from '../../../util/logging/logger';

export class Commands<T extends string = string> {
  private readonly commandPrefix: string;
  private readonly disposables: Disposable[] = [];

  public constructor(private readonly logger: Logger, namespace?: string) {
    this.commandPrefix = namespace ? `${namespace}:` : '';
    this.disposables.push(logger);
  }

  public register(command: T, callback: (...args: any[]) => any, thisArg?: any): void {
    const namespacedCommandName = this.getCommandName(command);
    this.logger.debug(() => `Registering command '${command}' as namespaced command '${namespacedCommandName}`);
    const namespacedCommand = commands.registerCommand(namespacedCommandName, callback, thisArg);
    this.disposables.push(namespacedCommand);
  }

  public execute<R = any>(command: T, ...args: any[]): Thenable<R> {
    const namespacedCommandName = this.getCommandName(command);
    this.logger.debug(() => `Executing command '${command}' as namespaced command '${namespacedCommandName}`);
    return commands.executeCommand(namespacedCommandName, ...args);
  }

  public getCommandName(command: T): string {
    return `${this.commandPrefix}${command}`;
  }

  public async dispose(): Promise<void> {
    await Disposer.dispose(this.disposables);
  }

  public static register(command: string, callback: (...args: any[]) => any, thisArg?: any): Disposable {
    return commands.registerCommand(command, callback, thisArg);
  }

  public static execute(command: string, ...args: any[]): Thenable<unknown> {
    return commands.executeCommand(command, ...args);
  }
}
