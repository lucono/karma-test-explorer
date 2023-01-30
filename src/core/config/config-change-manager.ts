import { ConfigurationChangeEvent, WorkspaceFolder, window, workspace } from 'vscode';

import { debounce } from 'throttle-debounce';

import { CONFIG_FILE_CHANGE_BATCH_DELAY } from '../../constants.js';
import { Disposable } from '../../util/disposable/disposable.js';
import { Disposer } from '../../util/disposable/disposer.js';
import { Logger } from '../../util/logging/logger.js';
import { normalizePath } from '../../util/utils.js';

interface ConfigChangeSubscription<T extends string> {
  readonly workspaceFolder: WorkspaceFolder;
  readonly watchedSettings: readonly T[];
  readonly changeHandler: ConfigChangeHandler<T>;
  readonly changeNotificationOptions?: ConfigChangeNotificationOptions;
}

export interface ConfigChangeNotificationOptions {
  showPrompt?: boolean;
  promptMessage?: string;
}

enum ConfigChangeAction {
  ApplySettings = 'Apply Settings',
  Ignore = 'Ignore'
}

export type ConfigChangeHandler<T> = (changedSettings: T[]) => void;

export type ConfigChangeConfirmationHandler<T> = (changedSettings: T[]) => Promise<void>;

export interface ConfigChangeManagerOptions {
  configNamespace?: string;
  changeHandlingDelay?: number;
  changeHandlingDelayMode?: 'Beginning' | 'Ending';
}

export class ConfigChangeManager<T extends string> implements Disposable {
  private readonly disposables: Disposable[] = [];
  private readonly configPrefix: string;
  private readonly configChangeSubscriptions: Set<ConfigChangeSubscription<T>> = new Set();
  private unprocessedConfigChanges: Map<ConfigChangeSubscription<T>, Set<T>> = new Map();

  public constructor(private readonly logger: Logger, options?: ConfigChangeManagerOptions) {
    this.configPrefix = options?.configNamespace ? `${options.configNamespace}.` : '';

    const debouncedConfigChangeHandler = debounce(
      options?.changeHandlingDelay ?? CONFIG_FILE_CHANGE_BATCH_DELAY,
      this.handleConfigurationChange.bind(this),
      { atBegin: options?.changeHandlingDelayMode === 'Ending' ? false : true }
    );

    this.logger.debug(() => 'Creating config change subscription');
    const configChangeSubscription = workspace.onDidChangeConfiguration(debouncedConfigChangeHandler);

    this.disposables.push(configChangeSubscription, logger);
  }

  public subscribeForConfigChanges(
    workspaceFolder: WorkspaceFolder,
    watchedSettings: readonly T[],
    changeHandler: ConfigChangeHandler<T>,
    changeNotificationOptions?: ConfigChangeNotificationOptions
  ): ConfigChangeSubscription<T> {
    const configChangeSubscription: ConfigChangeSubscription<T> = {
      workspaceFolder,
      watchedSettings,
      changeHandler,
      changeNotificationOptions
    };
    this.configChangeSubscriptions.add(configChangeSubscription);
    return configChangeSubscription;
  }

  public unsubscribeForConfigChanges(configChangeSubscription: ConfigChangeSubscription<T>) {
    this.configChangeSubscriptions.delete(configChangeSubscription);
  }

  public unsubscribeWorkspaceFolderForConfigChanges(workspaceFolder: WorkspaceFolder) {
    [...this.configChangeSubscriptions]
      .filter(subscription => subscription.workspaceFolder.uri.fsPath === workspaceFolder.uri.fsPath)
      .forEach(subscription => this.configChangeSubscriptions.delete(subscription));
  }

  private processConfigChangeSubscription(
    configChangeEvent: ConfigurationChangeEvent,
    configChangeSubscription: ConfigChangeSubscription<T>
  ): void {
    const changedSettings: T[] = configChangeSubscription.watchedSettings.filter(configSetting =>
      configChangeEvent.affectsConfiguration(
        `${this.configPrefix}${configSetting}`,
        configChangeSubscription.workspaceFolder
      )
    );

    if (changedSettings.length === 0) {
      return;
    }

    this.logger.debug(
      () =>
        `The following settings changed for workspace folder ` +
        `'${normalizePath(configChangeSubscription.workspaceFolder.uri.fsPath)}': ` +
        `${JSON.stringify(changedSettings, null, 2)}`
    );

    if (configChangeSubscription.changeNotificationOptions?.showPrompt === false) {
      configChangeSubscription.changeHandler(changedSettings);
      return;
    }

    const unprocessedConfigChanges = this.unprocessedConfigChanges.get(configChangeSubscription);

    if (!unprocessedConfigChanges) {
      this.unprocessedConfigChanges.set(configChangeSubscription, new Set(changedSettings));

      const promptMessage =
        configChangeSubscription.changeNotificationOptions?.promptMessage || 'Settings changed. Apply the changes?';

      window.showWarningMessage(promptMessage, ...Object.values(ConfigChangeAction)).then(selectedAction => {
        if (selectedAction === ConfigChangeAction.ApplySettings) {
          this.triggerConfigChangeSubscription(configChangeSubscription);
        }
      });
    } else {
      this.logger.debug(() => 'Ignoring new configuration changes - Confirmation already pending for previous changes');
      changedSettings.forEach(changedSetting => unprocessedConfigChanges.add(changedSetting));
    }
  }

  private triggerConfigChangeSubscription(configChangeSubscription: ConfigChangeSubscription<T>) {
    const unprocessedConfigChanges = this.unprocessedConfigChanges.get(configChangeSubscription);

    if (unprocessedConfigChanges?.size) {
      configChangeSubscription.changeHandler([...unprocessedConfigChanges]);
    }
    this.unprocessedConfigChanges.delete(configChangeSubscription);
  }

  private handleConfigurationChange(configChangeEvent: ConfigurationChangeEvent): void {
    this.logger.info(() => 'Configuration changed');

    this.configChangeSubscriptions.forEach(configChangeSubscription =>
      this.processConfigChangeSubscription(configChangeEvent, configChangeSubscription)
    );
  }

  public async dispose(): Promise<void> {
    await Disposer.dispose(this.disposables);
  }
}
