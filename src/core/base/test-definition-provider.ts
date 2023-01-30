import { Disposable } from '../../util/disposable/disposable.js';
import { TestDefinitionInfo } from '../test-locator.js';

export interface TestDefinitionProvider extends Disposable {
  getTestDefinitions(suite: readonly string[], test: string): TestDefinitionInfo[];

  addFileContent(fileText: string, filePath: string): void;

  removeFileContents(files: readonly string[]): void;

  clearAllContent(): void;
}
