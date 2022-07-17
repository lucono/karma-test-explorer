import { Disposable } from '../../util/disposable/disposable';
import { TestDefinitionInfo } from '../test-locator';

export interface TestDefinitionProvider extends Disposable {
  getTestDefinitions(suite: readonly string[], test: string): TestDefinitionInfo[];

  addFileContent(file: string, testContent: string): void;

  removeFileContents(files: readonly string[]): void;

  clearAllContent(): void;
}
