import { EXTENSION_NAME } from '../../../constants.js';
import { Disposable } from '../../../util/disposable/disposable.js';
import { Disposer } from '../../../util/disposable/disposer.js';
import { StatusType } from './notification-handler.js';
import { StatusDisplay } from './status-display.js';

const STATUS_TYPE_DISPLAY_PRIORITY_ORDER: StatusType[] = [
  StatusType.Error,
  StatusType.Warning,
  StatusType.Busy,
  StatusType.Waiting,
  StatusType.Done,
  StatusType.Info
];
export class MultiStatusDisplay implements Disposable {
  private readonly allDisplays: Map<string, StatusDisplay> = new Map();
  private readonly shownDisplays: Set<StatusDisplay> = new Set();
  private readonly disposables: Disposable[] = [];

  public constructor(private readonly aggregateStatusDisplay: StatusDisplay) {
    this.disposables.push(aggregateStatusDisplay);
  }

  public createDisplay(displayName: string): StatusDisplay {
    const existingNamedDisplay = this.allDisplays.get(displayName);

    if (existingNamedDisplay) {
      return existingNamedDisplay;
    }

    const newDisplay: StatusDisplay = {
      text: '',
      tooltip: undefined,
      command: undefined,
      dispose: () => this.disposeDisplay(displayName),
      show: () => this.showDisplay(newDisplay),
      hide: () => this.hideDisplay(newDisplay)
    };
    this.allDisplays.set(displayName, newDisplay);
    return newDisplay;
  }

  private showDisplay(display: StatusDisplay) {
    this.shownDisplays.add(display);
    this.updateDisplay();
  }

  private hideDisplay(display: StatusDisplay) {
    this.shownDisplays.delete(display);
    this.updateDisplay();
  }

  private updateDisplay() {
    const tooltipItemSeparator = '  ▪  ';
    const messageItemSeparator = '$(debug-stackframe-dot)';

    const statusSorter = (display1: StatusDisplay, display2: StatusDisplay) => {
      const msg1Type: StatusType = display1.type ?? StatusType.Info;
      const msg2Type: StatusType = display2.type ?? StatusType.Info;
      const msg1Priority = STATUS_TYPE_DISPLAY_PRIORITY_ORDER.indexOf(msg1Type);
      const msg2Priority = STATUS_TYPE_DISPLAY_PRIORITY_ORDER.indexOf(msg2Type);
      return msg1Priority - msg2Priority;
    };

    if (this.shownDisplays.size === 0) {
      this.aggregateStatusDisplay.hide();
      return;
    }
    if (this.shownDisplays.size === 1) {
      const singleDisplay = [...this.shownDisplays][0];
      this.aggregateStatusDisplay.text = `${EXTENSION_NAME}${messageItemSeparator}${singleDisplay.text}`;
      this.aggregateStatusDisplay.tooltip = singleDisplay.tooltip;
      this.aggregateStatusDisplay.command = singleDisplay.command;
    } else {
      const uniqueStatusMessages = new Set([...this.shownDisplays].sort(statusSorter).map(display => display.text));
      const combinedStatusMessages = [...uniqueStatusMessages].join(messageItemSeparator);

      const uniqueTooltips = new Set(
        [...this.shownDisplays].sort(statusSorter).map(display => display.text.replace(/\$\([^()]+\)/g, '').trim())
      );
      const combinedTooltip = [...uniqueTooltips].join(tooltipItemSeparator);

      this.aggregateStatusDisplay.text = `${EXTENSION_NAME}${messageItemSeparator}${combinedStatusMessages}`;
      this.aggregateStatusDisplay.tooltip = `${EXTENSION_NAME}${tooltipItemSeparator}${combinedTooltip}`;
      this.aggregateStatusDisplay.command = undefined;
    }
    this.aggregateStatusDisplay.show();
  }

  private disposeDisplay(displayName: string) {
    const display = this.allDisplays.get(displayName);

    if (!display) {
      return;
    }

    this.allDisplays.delete(displayName);
    this.shownDisplays.delete(display);
    this.updateDisplay();
  }

  public dispose(): void | Promise<void> {
    Disposer.dispose(this.disposables);
  }
}
