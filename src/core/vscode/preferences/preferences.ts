import { ExtensionContext, Memento } from 'vscode';
import { Disposable } from '../../../util/disposable/disposable';
import { Disposer } from '../../../util/disposable/disposer';
import { Logger } from '../../../util/logging/logger';
import { ExtensionPreference } from './extension-preference';

export class Preferences implements Disposable {
  private readonly disposables: Disposable[] = [];
  private readonly workspacePrefs: Memento;
  private readonly globalPrefs: Memento;

  public constructor(readonly extensionContext: ExtensionContext, private readonly logger: Logger) {
    this.workspacePrefs = extensionContext.workspaceState;
    this.globalPrefs = extensionContext.globalState;
    this.disposables.push(logger);
  }

  get lastLoadedProjectPaths(): string[] {
    return this.getPref<string[]>(ExtensionPreference.LastLoadedProjectPaths) ?? [];
  }

  set lastLoadedProjectPaths(projectPaths: string[]) {
    this.setPref(ExtensionPreference.LastLoadedProjectPaths, projectPaths);
  }

  private getPref<T>(pref: ExtensionPreference): T | undefined;
  private getPref<T>(pref: ExtensionPreference, defaultValue: T): T;
  private getPref<T>(pref: ExtensionPreference, defaultValue?: T): T | undefined {
    return this.globalPrefs.get<T>(pref) ?? this.workspacePrefs.get<T>(pref) ?? defaultValue;
  }

  private setPref<T>(pref: ExtensionPreference, value: T, setGlobal: boolean = false): void {
    const previousValue = this.getPref(pref) ?? 'undefined';
    const prefsScope = setGlobal ? this.globalPrefs : this.workspacePrefs;
    prefsScope.update(pref, value);

    this.logger.debug(
      () =>
        `Updated preference '${pref}' ` +
        `${setGlobal ? 'globally' : 'in current workspace'} ` +
        `from: ${JSON.stringify(previousValue, null, 2)} ` +
        `to: ${JSON.stringify(value, null, 2)}`
    );
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
