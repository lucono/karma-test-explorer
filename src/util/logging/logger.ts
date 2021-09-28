import { Disposable } from '../disposable/disposable';

export interface Logger extends Disposable {
  error(msgSource: () => string): void;
  warn(msgSource: () => string): void;
  info(msgSource: () => string): void;
  debug(msgSource: () => string): void;
  trace(msgSource: () => string): void;
}
