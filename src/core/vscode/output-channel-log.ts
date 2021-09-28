import { OutputChannel, window } from 'vscode';
import { LogAppender } from '../../util/logging/log-appender';

export interface OutputChannelLogOptions {
  enabled?: boolean;
  lazyCreate?: boolean;
}

const DEFAULT_OUTPUT_CHANNEL_OPTIONS: OutputChannelLogOptions = {
  enabled: true,
  lazyCreate: false
};

export class OutputChannelLog implements LogAppender {
  private outputChannel?: OutputChannel;
  private readonly options: OutputChannelLogOptions;

  public constructor(private readonly outputChannelName: string, options: OutputChannelLogOptions = {}) {
    this.options = { ...DEFAULT_OUTPUT_CHANNEL_OPTIONS, ...options };

    if (this.options.enabled && !this.options.lazyCreate) {
      this.outputChannel = window.createOutputChannel(outputChannelName);
    }
  }

  public append(msg: string): void {
    if (this.options.enabled) {
      this.output().appendLine(msg);
    }
  }

  public show(preserveFocus: boolean = true): void {
    this.output().show(preserveFocus);
  }

  private output(): OutputChannel {
    if (!this.outputChannel) {
      this.outputChannel = window.createOutputChannel(this.outputChannelName);
    }
    return this.outputChannel;
  }

  public dispose() {
    this.outputChannel?.dispose();
  }
}
