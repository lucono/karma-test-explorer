import { commands, StatusBarItem, window } from 'vscode';
import { EXTENSION_NAME, STATUS_BAR_MESASGE_MAX_DURATION } from '../../constants';
import { Disposable } from '../../util/disposable/disposable';
import { Disposer } from '../../util/disposable/disposer';
import { DeferredPromise } from '../../util/future/deferred-promise';
import { Logger } from '../../util/logging/logger';
import { ExtensionCommands } from './extension-commands';

export enum MessageType {
  Info = 'Info',
  Warning = 'Warning',
  Error = 'Error'
}

export enum StatusType {
  Busy = 'sync~spin',
  Waiting = 'pause',
  Done = 'check',
  Info = 'info',
  Warning = 'warning',
  Error = 'error'
}

export interface NotificationAction {
  label: string;
  description?: string;
  handler: (() => any) | { command: string; arguments?: any[] };
}

export interface NotifyOptions {
  showLogAction: boolean;
  dismissAction: boolean;
}

const SHOW_LOG_NOTIFICATION_ACTION: NotificationAction = {
  label: 'Show Log',
  description: 'Click to show log',
  handler: { command: ExtensionCommands.ShowLog }
};

const DISMISS_NOTIFICATION_ACTION: NotificationAction = {
  label: 'Dismiss',
  handler: () => {
    // Do nothing
  }
};

const DEFAULT_NOTIFY_OPTIONS: NotifyOptions = {
  showLogAction: true,
  dismissAction: true
};

export class Notifications implements Disposable {
  private readonly statusBar: StatusBarItem;
  private deferredStatus?: DeferredPromise;
  private disposables: Disposable[] = [];

  public constructor(private readonly logger: Logger) {
    this.statusBar = window.createStatusBarItem();
    this.disposables.push(this.statusBar, logger);
  }

  public notify(
    type: MessageType,
    message: string,
    actions: NotificationAction[] = [],
    notifyOptions: NotifyOptions = DEFAULT_NOTIFY_OPTIONS
  ): void {
    const notifier = (
      type === MessageType.Error
        ? window.showErrorMessage
        : type === MessageType.Warning
        ? window.showWarningMessage
        : window.showInformationMessage
    ).bind(window);

    const allActions: NotificationAction[] = [...actions];

    if (notifyOptions.showLogAction) {
      allActions.push(SHOW_LOG_NOTIFICATION_ACTION);
    }
    if (notifyOptions.dismissAction) {
      allActions.push(DISMISS_NOTIFICATION_ACTION);
    }

    const actionLabels = allActions.map(action => action.label);

    notifier(message, ...actionLabels).then(selectedActionLabel => {
      const selectedAction = allActions.find(action => action.label === selectedActionLabel);

      if (selectedAction) {
        this.logger.debug(
          () =>
            `User selected: ${selectedAction.label}` +
            (selectedAction.description ? ` (${selectedAction.description})` : '')
        );
        this.executeAction(selectedAction);
      }
    });
  }

  public notifyStatus(
    statusType: StatusType,
    message: string,
    dismiss?: Thenable<any>,
    action: NotificationAction = SHOW_LOG_NOTIFICATION_ACTION
  ) {
    const statusName = Object.keys(StatusType).find(
      nameOfStatus => StatusType[nameOfStatus as keyof typeof StatusType] === statusType
    );
    const tooltip = action.description ?? action.label;

    this.logger.debug(() => `Setting status type '${statusName}' with message '${message}' and tooltip: ${tooltip}`);

    this.deferredStatus?.reject();
    this.statusBar.hide();
    this.statusBar.text = `$(${statusType}) ${EXTENSION_NAME} - ${message}`;

    this.statusBar.command =
      'command' in action.handler
        ? { title: action.label, ...action.handler }
        : { title: 'Click', command: ExtensionCommands.ExecuteFunction, arguments: [action.handler] };

    this.statusBar.tooltip = tooltip;
    this.statusBar.show();

    const deferredStatus = new DeferredPromise();
    deferredStatus.autoFulfill(STATUS_BAR_MESASGE_MAX_DURATION);

    const statusResolver = deferredStatus.fulfill.bind(deferredStatus);
    dismiss?.then(statusResolver, statusResolver);

    deferredStatus.promise().then(() => this.statusBar.hide());
    this.deferredStatus = deferredStatus;
  }

  private executeAction(action: NotificationAction) {
    if ('command' in action.handler) {
      commands.executeCommand(action.handler.command, ...(action.handler.arguments ?? []));
    } else {
      setImmediate(action.handler);
    }
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
