import { commands, StatusBarItem, window } from 'vscode';
import { EXTENSION_NAME, STATUS_BAR_MESASGE_MAX_DURATION } from '../../constants';
import { Disposable } from '../../util/disposable/disposable';
import { Disposer } from '../../util/disposable/disposer';
import { DeferredPromise } from '../../util/future/deferred-promise';
import { Logger } from '../../util/logging/logger';
import { getPropertyWithValue } from '../../util/utils';
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

type NotificationActionHandler = (() => any) | { command: string; arguments?: any[] };

export interface NotificationAction {
  label: string;
  description?: string;
  handler: NotificationActionHandler;
}

export interface NotifyOptions {
  showLogAction?: boolean;
  dismissAction?: boolean;
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

    this.logger.debug(
      () => `Showing '${type}' notification with actions ${JSON.stringify(actions)} and message: ${message}`
    );

    notifier(message, ...actionLabels).then(selectedActionLabel => {
      const selectedAction = allActions.find(action => action.label === selectedActionLabel);

      if (selectedAction) {
        this.logger.debug(
          () =>
            `User selected '${selectedAction.label}' for '${type}' notification: ${message}` +
            (selectedAction.description ? ` (${selectedAction.description})` : '')
        );
        this.executeAction(selectedAction.handler);
      }
    });
  }

  public notifyStatus(
    statusType: StatusType,
    message: string,
    dismiss?: Thenable<any>,
    action: NotificationAction = SHOW_LOG_NOTIFICATION_ACTION
  ) {
    const statusName = getPropertyWithValue(StatusType, statusType);
    const tooltip = action.description ?? action.label;

    this.logger.trace(() => `Setting '${statusName}' status with message '${message}' and tooltip: ${tooltip}`);

    this.deferredStatus?.reject();
    this.statusBar.hide();
    this.statusBar.text = `$(${statusType}) ${EXTENSION_NAME} - ${message}`;
    this.statusBar.tooltip = tooltip;

    const clickCommand =
      'command' in action.handler
        ? { title: action.label, ...action.handler }
        : { title: 'Click', command: ExtensionCommands.ExecuteFunction, arguments: [action.handler] };

    const clickHandler = () => {
      this.logger.debug(() => `User clicked status: ${message} (${tooltip})`);
      this.executeAction(clickCommand);
    };

    this.statusBar.command = {
      title: clickCommand.title,
      command: ExtensionCommands.ExecuteFunction,
      arguments: [clickHandler]
    };

    this.statusBar.show();

    const deferredStatus = new DeferredPromise();
    deferredStatus.autoFulfill(STATUS_BAR_MESASGE_MAX_DURATION);

    const statusResolver = deferredStatus.fulfill.bind(deferredStatus);
    dismiss?.then(statusResolver, statusResolver);

    deferredStatus.promise().then(() => {
      this.logger.trace(() => `Dismissing '${statusName}' status with message '${message}' and tooltip: ${tooltip}`);
      this.statusBar.hide();
    });
    this.deferredStatus = deferredStatus;
  }

  private executeAction(handler: NotificationActionHandler) {
    if ('command' in handler) {
      commands.executeCommand(handler.command, ...(handler.arguments ?? []));
    } else {
      setImmediate(handler);
    }
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
