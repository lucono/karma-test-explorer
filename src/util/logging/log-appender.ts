import { Disposable } from '../disposable/disposable.js';

export interface LogAppender extends Disposable {
  append(content: string): void;
}
