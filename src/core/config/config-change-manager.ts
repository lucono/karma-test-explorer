import { debounce } from 'throttle-debounce';
import { ConfigurationChangeEvent, window, workspace, WorkspaceFolder } from 'vscode';
import { CONFIG_FILE_CHANGE_BATCH_DELAY } from '../../constants';
import { Disposable } from '../../util/disposable/disposable';
import { Disposer } from '../../util/disposable/disposer';
import { Logger } from '../../util/logging/logger';

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
  private readonly configChangeSubscriptions: ConfigChangeSubscription<T>[] = [];
  private unprocessedConfigChanges: Map<ConfigChangeSubscription<T>, Set<T>> = new Map();

  public constructor(private readonly logger: Logger, options?: ConfigChangeManagerOptions) {
    this.configPrefix = options?.configNamespace ? `${options.configNamespace}.` : '';

    const debouncedConfigChangeHandler = debounce(
      options?.changeHandlingDelay ?? CONFIG_FILE_CHANGE_BATCH_DELAY,
      options?.changeHandlingDelayMode === 'Ending' ? false : true,
      this.handleConfigurationChange.bind(this)
    );

    this.logger.debug(() => 'Creating config change subscription');
    const configChangeSubscription = workspace.onDidChangeConfiguration(debouncedConfigChangeHandler);

    this.disposables.push(configChangeSubscription, logger);
  }

  public watchForConfigChange(
    workspaceFolder: WorkspaceFolder,
    watchedSettings: readonly T[],
    changeHandler: ConfigChangeHandler<T>,
    changeNotificationOptions?: ConfigChangeNotificationOptions
  ) {
    const configChangeSubscription: ConfigChangeSubscription<T> = {
      workspaceFolder,
      watchedSettings,
      changeHandler,
      changeNotificationOptions
    };
    this.configChangeSubscriptions.push(configChangeSubscription);
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

    this.logger.debug(() => `Config Settings Changed: ${JSON.stringify(changedSettings, null, 2)}`);

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
