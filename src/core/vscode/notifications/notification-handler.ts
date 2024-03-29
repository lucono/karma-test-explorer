import { commands, window } from 'vscode';

import { STATUS_BAR_MESASGE_MAX_DURATION, STATUS_BAR_MESASGE_MIN_DURATION } from '../../../constants.js';
import { Disposable } from '../../../util/disposable/disposable.js';
import { Disposer } from '../../../util/disposable/disposer.js';
import { DeferredPromise } from '../../../util/future/deferred-promise.js';
import { Logger } from '../../../util/logging/logger.js';
import { getPropertyWithValue } from '../../../util/utils.js';
import { ExtensionCommands } from '../commands/extension-commands.js';
import { StatusDisplay } from './status-display.js';

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

const DEFAULT_NOTIFY_OPTIONS: NotifyOptions = {
  showLogAction: true,
  dismissAction: true
};

export interface NotificationsOptions {
  showLogCommand?: string;
}

export class NotificationHandler implements Disposable {
  private readonly disposables: Disposable[] = [];
  private readonly showLogNotificationAction?: NotificationAction;
  private readonly dismissNotificationAction: NotificationAction;
  private deferredStatusDismissal?: DeferredPromise;

  public constructor(
    private readonly statusDisplay: StatusDisplay,
    private readonly logger: Logger,
    options?: NotificationsOptions
  ) {
    if (options?.showLogCommand) {
      this.showLogNotificationAction = {
        label: 'Show Log',
        description: 'Click to show log',
        handler: { command: options?.showLogCommand }
      };
    }

    this.dismissNotificationAction = { label: 'Dismiss', handler: () => ({}) };
    this.disposables.push(statusDisplay, logger);
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

    if (notifyOptions.showLogAction && this.showLogNotificationAction !== undefined) {
      allActions.push(this.showLogNotificationAction);
    }
    if (notifyOptions.dismissAction) {
      allActions.push(this.dismissNotificationAction);
    }

    const actionLabels = allActions.map(action => action.label);

    this.logger.debug(
      () =>
        `Showing '${type}' notification with actions ` +
        `${actions.map(action => `'${action.label}'`).join(', ')} ` +
        `and message: ${message}`
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
    action: NotificationAction | undefined = this.showLogNotificationAction
  ) {
    const statusName = getPropertyWithValue(StatusType, statusType);
    const tooltip = action?.description ?? action?.label;

    this.logger.trace(
      () => `Setting '${statusName}' status with message '${message}' and tooltip: ${tooltip ?? '<none>'}`
    );

    if (this.deferredStatusDismissal?.promise().isResolved() === false) {
      this.logger.trace(() => 'Existing status is yet to dismiss - Will cancel future dismissal');
      this.deferredStatusDismissal.reject(`Displaying new status with message - ${message}`);
    }

    this.statusDisplay.hide();
    this.statusDisplay.type = statusType;
    this.statusDisplay.text = `$(${statusType}) ${message}`;
    this.statusDisplay.tooltip = tooltip;

    if (action !== undefined) {
      const clickCommand =
        'command' in action.handler
          ? { title: action.label, ...action.handler }
          : { title: 'Click', command: ExtensionCommands.ExecuteFunction, arguments: [action.handler] };

      const clickHandler = () => {
        this.logger.debug(() => `User clicked status: ${message} (${tooltip})`);
        this.executeAction(clickCommand);
      };

      this.statusDisplay.command = {
        title: clickCommand.title,
        command: ExtensionCommands.ExecuteFunction,
        arguments: [clickHandler]
      };
    }

    this.statusDisplay.show();

    const deferredStatusDismissal = new DeferredPromise();
    deferredStatusDismissal.autoFulfill(dismiss ? STATUS_BAR_MESASGE_MAX_DURATION : STATUS_BAR_MESASGE_MIN_DURATION);

    const fulfillFutureDismissal = () => {
      this.logger.trace(
        () =>
          `Dismissing promise has concluded for '${statusName}' ` +
          `status with message '${message}' and tooltip: ${tooltip}`
      );
      deferredStatusDismissal.fulfill();
    };

    dismiss?.then(fulfillFutureDismissal, fulfillFutureDismissal);

    const dismissStatus = () => {
      if (this.deferredStatusDismissal !== deferredStatusDismissal) {
        this.logger.trace(
          () =>
            `Aborting dismiss of '${statusName}' status with message '${message}' - ` +
            `Different status already displayed`
        );
        return;
      }
      this.logger.trace(() => `Dismissing '${statusName}' status with message '${message}' and tooltip: ${tooltip}`);
      this.statusDisplay.hide();
    };

    deferredStatusDismissal.promise().then(dismissStatus);

    deferredStatusDismissal.promise().catch(reason => {
      this.logger.trace(
        () => `Cancelled status dismisser for '${statusName}' status with message '${message}' due to reason: ${reason}`
      );
    });

    this.deferredStatusDismissal = deferredStatusDismissal;
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
