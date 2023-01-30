import { Disposable } from '../disposable/disposable.js';

export interface Logger extends Disposable {
  error(provideMessage: () => string): void;
  warn(provideMessage: () => string): void;
  info(provideMessage: () => string): void;
  debug(provideMessage: () => string): void;
  trace(provideMessage: () => string): void;
}
