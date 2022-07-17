import { Command, MarkdownString } from 'vscode';
import { Disposable } from '../../../util/disposable/disposable';
import { StatusType } from './notification-handler';

export interface StatusDisplay extends Disposable {
  type?: StatusType;
  text: string;
  tooltip?: string | MarkdownString;
  command: string | Command | undefined;
  readonly show: () => void;
  readonly hide: () => void;
}
