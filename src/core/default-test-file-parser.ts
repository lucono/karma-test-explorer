import { Disposable } from '../util/disposable/disposable';
import { Disposer } from '../util/disposable/disposer';
import { Logger } from '../util/logging/logger';
import { escapeForRegExp, generateRandomId, stripJsComments } from '../util/utils';
import { TestInterface } from './base/test-framework';
import { TestFileParser, TestNodeType, TestSuiteFileInfo } from './test-file-parser';

export class DefaultTestFileParser implements TestFileParser {
  private disposables: Disposable[] = [];

  public constructor(private readonly testInterface: TestInterface, private readonly logger: Logger) {
    this.disposables.push(logger);
  }

  public parseFileText(fileText: string): TestSuiteFileInfo {
    const parseId = generateRandomId();
    this.logger.trace(() => `Parse operation ${parseId}: Parsing file text: \n${fileText}`);

    const data = this.getTestFileData(fileText);
    const fileInfo: TestSuiteFileInfo = {
      [TestNodeType.Suite]: [],
      [TestNodeType.Test]: []
    };

    const testInterfaceParserRegex = this.getTestNodeRegex(this.testInterface); // TODO: Switch to AST parser
    let matchResult: RegExpExecArray | null;
    let activeLineNumber: number | undefined;

    while ((matchResult = testInterfaceParserRegex.exec(data)) != null) {
      activeLineNumber = matchResult[3] !== undefined ? Number(matchResult[3]) : activeLineNumber;
      const nodeType = this.toNodeType(matchResult[4]);
      const testDescription = matchResult[6]?.replace(/\\(['"`])/g, '$1');

      if (!nodeType || !testDescription) {
        continue;
      }
      fileInfo[nodeType].push({
        description: testDescription,
        lineNumber: activeLineNumber
      });
    }

    this.logger.trace(
      () => `Parse operation ${parseId}: Parsed total ${fileInfo.Test.length} tests in ${fileInfo.Suite.length} suites`
    );

    return fileInfo;
  }

  private getTestFileData(fileText: string): string {
    const numberedFileText = fileText
      .split('\n')
      .map((lineText, lineNumber) => `${lineNumber}. ${lineText}`)
      .join('\n');

    return stripJsComments(numberedFileText);
  }

  private toNodeType(testInterfaceString: string): TestNodeType | undefined {
    return this.testInterface.suite.includes(testInterfaceString)
      ? TestNodeType.Suite
      : this.testInterface.test.includes(testInterfaceString)
      ? TestNodeType.Test
      : undefined;
  }

  private getTestNodeRegex(testInterface: TestInterface): RegExp {
    const interfaceStrings = [...testInterface.suite, ...testInterface.test].map(escapeForRegExp).join('|');
    const pattern = `((^|\\n)(\\d+)\\.)?\\s+(${interfaceStrings})\\s*\\(\\s*((?<![\\\\])[\\\`\\'\\"])((?:.(?!(?<![\\\\])\\5))*.?)\\5`;

    return new RegExp(pattern, 'gis');
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
