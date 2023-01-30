import { Command, MarkdownString } from 'vscode';

import { Disposable } from '../../../util/disposable/disposable.js';
import { StatusType } from './notification-handler.js';

export interface StatusDisplay extends Disposable {
  type?: StatusType;
  text: string;
  tooltip?: string | MarkdownString;
  command: string | Command | undefined;
  readonly show: () => void;
  readonly hide: () => void;
}
