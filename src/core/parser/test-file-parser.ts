import { Disposable } from '../../util/disposable/disposable';

export interface TestFileParser<T> extends Disposable {
  parseFileText(fileText: string, filePath: string): T;
}
