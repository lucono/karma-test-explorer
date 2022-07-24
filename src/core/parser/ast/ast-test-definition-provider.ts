import { Disposable } from '../../../util/disposable/disposable';
import { Disposer } from '../../../util/disposable/disposer';
import { Logger } from '../../../util/logging/logger';
import { regexJsonReplacer } from '../../../util/utils';
import { TestDefinitionProvider } from '../../base/test-definition-provider';
import { TestDefinitionInfo } from '../../test-locator';
import { AstTestFileParser } from './ast-test-file-parser';
import {
  DescribedTestDefinition,
  DescribedTestDefinitionInfo,
  DescribedTestDefinitionType
} from './described-test-definition';

export class AstTestDefinitionProvider implements TestDefinitionProvider {
  private readonly disposables: Disposable[] = [];
  private readonly specFilesByTopLevelSuite: Map<string, Set<string>> = new Map();
  private readonly testDefinitionInfosByFile: Map<string, DescribedTestDefinitionInfo[]> = new Map();

  public constructor(private readonly testFileParser: AstTestFileParser, private readonly logger: Logger) {
    this.disposables.push(logger);
  }

  public addFileContent(fileText: string, filePath: string): void {
    this.logger.trace(() => `Processing spec file: ${filePath}`);

    this.removeFileContents([filePath]);
    const testDefinitionInfos = this.testFileParser.parseFileText(fileText, filePath);

    testDefinitionInfos.forEach(testDefinitionInfo => {
      this.addFileOfTestToCache(testDefinitionInfo.suite, testDefinitionInfo.test, [filePath]);
    });
    this.testDefinitionInfosByFile.set(filePath, testDefinitionInfos);
  }

  public removeFileContents(filePaths: readonly string[]) {
    filePaths.forEach(fileToPurge => {
      if (!this.testDefinitionInfosByFile.has(fileToPurge)) {
        return;
      }
      this.testDefinitionInfosByFile.delete(fileToPurge);

      [...this.specFilesByTopLevelSuite.entries()].forEach(([suite, files]) => {
        files.delete(fileToPurge);

        if (files.size === 0) {
          this.specFilesByTopLevelSuite.delete(suite);
        }
      });
    });
  }

  public clearAllContent(): void {
    this.testDefinitionInfosByFile.clear();
    this.specFilesByTopLevelSuite.clear();
  }

  public getTestDefinitions(specSuite: string[], specDescription: string): TestDefinitionInfo[] {
    const testDefinitionResults: TestDefinitionInfo[] = [];
    const cachedSpecFiles = this.getFilesOfTestFromCache(specSuite, specDescription);
    const specFiles = cachedSpecFiles ?? [...this.testDefinitionInfosByFile.keys()];

    specFiles.forEach(specFile => {
      const testDefinitionsForSpecFile = this.getTestDefinitionsForFile(specFile, specSuite, specDescription);
      testDefinitionResults.push(...testDefinitionsForSpecFile);
    });

    if (testDefinitionResults.length > 0 && !cachedSpecFiles) {
      this.addFileOfTestToCache(
        specSuite,
        specDescription,
        testDefinitionResults.map(testItem => testItem.test.file)
      );
    }
    this.logger.trace(
      () =>
        `Got ${testDefinitionResults.length} test definitions: ` +
        `${JSON.stringify(testDefinitionResults, regexJsonReplacer, 2)} \n` +
        `for test definition lookup of spec suite: ${JSON.stringify(specSuite)} \n` +
        `and spec description: ${specDescription}`
    );

    return testDefinitionResults;
  }

  private getTestDefinitionsForFile(
    filePath: string,
    specSuite: string[],
    specDescription: string
  ): DescribedTestDefinitionInfo[] {
    let testDefinitionInfos = this.testDefinitionInfosByFile.get(filePath) ?? [];

    testDefinitionInfos = testDefinitionInfos.filter(
      testDefinitionInfo => testDefinitionInfo.suite.length === specSuite.length
    );

    specSuite.forEach((suiteDescription, suiteIndex) => {
      testDefinitionInfos = testDefinitionInfos.filter(testDefinitionInfo => {
        const suiteDefinition = testDefinitionInfo.suite[suiteIndex];

        const suiteDescriptionMatchesDefinition =
          suiteDefinition === undefined
            ? false
            : suiteDefinition.descriptionType === DescribedTestDefinitionType.Pattern
            ? suiteDefinition.description.test(suiteDescription)
            : suiteDefinition.description === suiteDescription;

        return suiteDescriptionMatchesDefinition;
      });
    });

    testDefinitionInfos = testDefinitionInfos.filter(testDefinitionInfo =>
      testDefinitionInfo.test.descriptionType === DescribedTestDefinitionType.Pattern
        ? testDefinitionInfo.test.description.test(specDescription)
        : testDefinitionInfo.test.description === specDescription
    );
    return testDefinitionInfos;
  }

  private addFileOfTestToCache(
    specSuite: string[] | DescribedTestDefinition[],
    specDescription: string | DescribedTestDefinition,
    filePaths: string[]
  ) {
    const topLevelSuiteName = this.getTopLevelSuiteName(specSuite, specDescription);

    if (topLevelSuiteName === undefined) {
      return;
    }

    if (!this.specFilesByTopLevelSuite.has(topLevelSuiteName)) {
      this.specFilesByTopLevelSuite.set(topLevelSuiteName, new Set());
    }
    const suiteFiles = this.specFilesByTopLevelSuite.get(topLevelSuiteName)!;

    filePaths.forEach(filePath => {
      if (!suiteFiles.has(filePath)) {
        this.logger.trace(() => `Adding top level suite '${topLevelSuiteName}' to file cache: ${filePath}`);
        suiteFiles.add(filePath);
      }
    });
  }

  private getFilesOfTestFromCache(
    specSuite: string[] | DescribedTestDefinition[],
    specDescription: string | DescribedTestDefinition
  ): string[] | undefined {
    const topLevelSuiteName = this.getTopLevelSuiteName(specSuite, specDescription);

    const suiteFiles =
      topLevelSuiteName !== undefined ? this.specFilesByTopLevelSuite.get(topLevelSuiteName) : undefined;

    return suiteFiles ? [...suiteFiles] : undefined;
  }

  private getTopLevelSuiteName(
    specSuite: string[] | DescribedTestDefinition[],
    specDescription: string | DescribedTestDefinition
  ): string | undefined {
    const topLevelSuite = specSuite[0] || specDescription;

    return typeof topLevelSuite === 'string'
      ? topLevelSuite
      : topLevelSuite.descriptionType === DescribedTestDefinitionType.String
      ? topLevelSuite.description
      : undefined;
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
