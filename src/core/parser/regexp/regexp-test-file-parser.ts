import { Disposable } from '../../../util/disposable/disposable';
import { Disposer } from '../../../util/disposable/disposer';
import { Logger } from '../../../util/logging/logger';
import { escapeForRegExp, generateRandomId, stripJsComments } from '../../../util/utils';
import { TestDefinitionState } from '../../base/test-definition';
import { TestInterface } from '../../base/test-framework';
import { TestFileParser } from '../test-file-parser';
import { TestNode, TestNodeType } from './test-node';

export type RegexpTestFileParserResult = Record<TestNodeType, TestNode[]>;

export class RegexpTestFileParser implements TestFileParser<RegexpTestFileParserResult> {
  private disposables: Disposable[] = [];

  public constructor(private readonly testInterface: TestInterface, private readonly logger: Logger) {
    this.disposables.push(logger);
  }

  public parseFileText(fileText: string, filePath: string): RegexpTestFileParserResult {
    const parseId = generateRandomId();
    this.logger.trace(() => `Parse operation ${parseId}: Parsing file '${filePath}' having content: \n${fileText}`);

    const startTime = new Date();
    const data = this.getTestFileData(fileText);

    const fileInfo: RegexpTestFileParserResult = {
      [TestNodeType.Suite]: [],
      [TestNodeType.Test]: []
    };

    const testInterfaceParserRegexp = this.getTestNodeRegexp(this.testInterface);
    let matchResult: RegExpExecArray | null;
    let activeLineNumber: number | undefined;

    while ((matchResult = testInterfaceParserRegexp.exec(data)) != null) {
      activeLineNumber = matchResult[3] !== undefined ? Number(matchResult[3]) : activeLineNumber;
      const nodeDefinition = this.getNodeTypeAndState(matchResult[4]);
      const testDescription = matchResult[7]?.replace(/\\(['"`])/g, '$1');

      if (!nodeDefinition || !testDescription || activeLineNumber === undefined) {
        continue;
      }
      fileInfo[nodeDefinition.type].push({
        type: nodeDefinition.type,
        description: testDescription,
        line: activeLineNumber,
        state: nodeDefinition.state
      });
    }
    const elapsedTime = (Date.now() - startTime.getTime()) / 1000;

    this.logger.trace(
      () =>
        `Parse operation ${parseId}: ` +
        `Parsed ${fileInfo.Test.length} total tests ` +
        `from file '${filePath}' ` +
        `in ${elapsedTime.toFixed(2)} secs`
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

  private getNodeTypeAndState(
    testInterfaceString: string
  ): { type: TestNodeType; state: TestDefinitionState } | undefined {
    if (this.testInterface.suiteTags.default.includes(testInterfaceString)) {
      return { type: TestNodeType.Suite, state: TestDefinitionState.Default };
    } else if (this.testInterface.suiteTags.focused.includes(testInterfaceString)) {
      return { type: TestNodeType.Suite, state: TestDefinitionState.Focused };
    } else if (this.testInterface.suiteTags.disabled.includes(testInterfaceString)) {
      return { type: TestNodeType.Suite, state: TestDefinitionState.Disabled };
    } else if (this.testInterface.testTags.default.includes(testInterfaceString)) {
      return { type: TestNodeType.Test, state: TestDefinitionState.Default };
    } else if (this.testInterface.testTags.focused.includes(testInterfaceString)) {
      return { type: TestNodeType.Test, state: TestDefinitionState.Focused };
    } else if (this.testInterface.testTags.disabled.includes(testInterfaceString)) {
      return { type: TestNodeType.Test, state: TestDefinitionState.Disabled };
    }
    return undefined;
  }

  private getTestNodeRegexp(testInterface: TestInterface): RegExp {
    const suiteDescriptors = [
      ...testInterface.suiteTags.default,
      ...testInterface.suiteTags.focused,
      ...testInterface.suiteTags.disabled
    ];

    const testDescriptors = [
      ...testInterface.testTags.default,
      ...testInterface.testTags.focused,
      ...testInterface.testTags.disabled
    ];

    const interfaceStrings = [...suiteDescriptors, ...testDescriptors].map(escapeForRegExp).join('|');

    const pattern =
      `((^|\\n)(\\d+)\\.)?\\s+` + // line number
      `(${interfaceStrings})\\s*\\(\\s*` + // suite or test token such as describe / it
      `(\\n\\d+\\.\\s+)*` + // optional new lines before test description
      `((?<![\\\\])[\\\`\\'\\"])` + // test description opening quote
      `((?:.(?!(?<![\\\\])\\6))*.?)` + // test description
      `\\6`; // test description closing quote char of matching type with opening quote

    return new RegExp(pattern, 'gis');
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
