import { Disposable } from '../disposable/disposable';

export interface LogAppender extends Disposable {
  append(content: string): void;
}
