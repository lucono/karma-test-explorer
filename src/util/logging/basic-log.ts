import { Disposable } from '../disposable/disposable';

export interface BasicLog extends Disposable {
  error(msg: string): void;
  warn(msg: string): void;
  info(msg: string): void;
  debug(msg: string): void;
  trace?(msg: string): void;
}
