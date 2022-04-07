import { EXTENSION_NAME } from '../../../constants';
import { Disposable } from '../../../util/disposable/disposable';
import { Disposer } from '../../../util/disposable/disposer';
import { StatusDisplay } from './status-display';

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
    if (this.shownDisplays.size === 0) {
      this.aggregateStatusDisplay.hide();
      return;
    }
    if (this.shownDisplays.size === 1) {
      const singleDisplay = [...this.shownDisplays][0];
      this.aggregateStatusDisplay.text = `${EXTENSION_NAME}$(debug-stackframe-dot)${singleDisplay.text}`;
      this.aggregateStatusDisplay.tooltip = singleDisplay.tooltip;
      this.aggregateStatusDisplay.command = singleDisplay.command;
    } else {
      const combinedStatusMessages = [...this.shownDisplays]
        .map(display => display.text)
        .join('$(debug-stackframe-dot)');
      const unifiedStatusMessage = `${EXTENSION_NAME}$(debug-stackframe-dot)${combinedStatusMessages}`;

      this.aggregateStatusDisplay.text = unifiedStatusMessage;
      this.aggregateStatusDisplay.tooltip = undefined;
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
