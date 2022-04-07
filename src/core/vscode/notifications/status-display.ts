import { Command, MarkdownString } from 'vscode';
import { Disposable } from '../../../util/disposable/disposable';

export interface StatusDisplay extends Disposable {
  text: string;
  tooltip?: string | MarkdownString;
  command: string | Command | undefined;
  readonly show: () => void;
  readonly hide: () => void;
}
