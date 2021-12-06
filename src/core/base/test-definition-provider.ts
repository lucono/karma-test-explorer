import { TestDefinitionInfo } from '../test-locator';

export interface TestDefinitionProvider {
  getTestDefinitions(suite: readonly string[], test: string): TestDefinitionInfo[];

  addFileContent(file: string, testContent: string): void;

  updateFileContent(file: string, testContent: string): void;

  removeFileContents(files: readonly string[]): void;

  clearAllContent(): void;
}
