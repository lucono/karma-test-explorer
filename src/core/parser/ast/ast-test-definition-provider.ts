import { Disposable } from '../../../util/disposable/disposable';
import { Disposer } from '../../../util/disposable/disposer';
import { Logger } from '../../../util/logging/logger';
import { TestDefinitionProvider } from '../../base/test-definition-provider';
import { TestDefinitionInfo } from '../../test-locator';
import { AstTestFileParser } from './ast-test-file-parser';

export class AstTestDefinitionProvider implements TestDefinitionProvider {
  private readonly disposables: Disposable[] = [];
  private readonly specFilesBySuite: Map<string, string[]> = new Map();
  private readonly testDefinitionInfosByFile: Map<string, TestDefinitionInfo[]> = new Map();

  public constructor(private readonly testFileParser: AstTestFileParser, private readonly logger: Logger) {
    this.disposables.push(logger);
  }

  public addFileContent(filePath: string, testContent: string): void {
    this.logger.trace(() => `Processing spec file: ${filePath}`);

    this.removeFileContents([filePath]);
    const testDefinitionInfos = this.testFileParser.parseFileText(testContent, filePath);

    testDefinitionInfos.forEach(testDefinitionInfo => {
      const testSuite = testDefinitionInfo.suite.map(testSuiteDefinition => testSuiteDefinition.description);
      this.addSuiteFileToCache(testSuite, filePath);
    });

    this.testDefinitionInfosByFile.set(filePath, testDefinitionInfos);
  }

  public removeFileContents(filePaths: readonly string[]) {
    filePaths.forEach(fileToPurge => {
      if (!this.testDefinitionInfosByFile.has(fileToPurge)) {
        return;
      }
      this.testDefinitionInfosByFile.delete(fileToPurge);

      Array.from(this.specFilesBySuite.entries()).forEach((suiteToFilesEntry: [string, string[]]) => {
        const [suite, files] = suiteToFilesEntry;
        const fileIndex = files.indexOf(fileToPurge);

        if (fileIndex === -1) {
          return;
        }

        if (files.length > 1) {
          files.splice(files.indexOf(fileToPurge), 1);
        } else {
          this.specFilesBySuite.delete(suite);
        }
      });
    });
  }

  public clearAllContent(): void {
    this.testDefinitionInfosByFile.clear();
    this.specFilesBySuite.clear();
  }

  public getTestDefinitions(specSuite: string[], specDescription: string): TestDefinitionInfo[] {
    const testDefinitionResults: TestDefinitionInfo[] = [];

    if (specSuite.length === 0) {
      return testDefinitionResults;
    }
    const specFiles = this.getSuiteFilesFromCache(specSuite);

    if (specFiles) {
      specFiles.forEach(specFile => {
        const testDefinitionsForSpecFile = this.getTestDefinitionsForFile(specFile, specSuite, specDescription);
        testDefinitionResults.push(...testDefinitionsForSpecFile);
      });
    }

    return testDefinitionResults;
  }

  private getTestDefinitionsForFile(
    filePath: string,
    specSuite: string[],
    specDescription: string
  ): TestDefinitionInfo[] {
    const testDefinitionInfosForFile = this.testDefinitionInfosByFile.get(filePath);

    if (!testDefinitionInfosForFile) {
      return [];
    }

    let testDefinitionInfos = testDefinitionInfosForFile.filter(
      testDefinitionInfo => testDefinitionInfo.suite.length === specSuite.length
    );

    for (let suiteIndex = 0; suiteIndex < specSuite.length; suiteIndex++) {
      testDefinitionInfos = testDefinitionInfos.filter(
        testDefinitionInfo => testDefinitionInfo.suite[suiteIndex]?.description === specSuite[suiteIndex]
      );
    }

    testDefinitionInfos = testDefinitionInfos.filter(
      testDefinitionInfo => testDefinitionInfo.test.description === specDescription
    );
    return testDefinitionInfos;
  }

  private addSuiteFileToCache(suite: string[], filePath: string) {
    const suiteKey = suite.join(' ');

    if (!this.specFilesBySuite.has(suiteKey)) {
      this.specFilesBySuite.set(suiteKey, []);
    }
    const suiteFiles = this.specFilesBySuite.get(suiteKey)!;

    if (!suiteFiles.includes(filePath)) {
      this.logger.debug(() => `Adding suite file to cache: ${filePath}`);
      this.logger.trace(() => `Added suite file '${filePath}' to cache with key: ${suiteKey}`);

      suiteFiles.push(filePath);
    }
  }

  private getSuiteFilesFromCache(suite: string[]): string[] | undefined {
    const suiteKey = suite.join(' ');
    return this.specFilesBySuite.get(suiteKey);
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
