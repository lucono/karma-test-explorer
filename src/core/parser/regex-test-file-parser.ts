import { Disposable } from '../../util/disposable/disposable';
import { Disposer } from '../../util/disposable/disposer';
import { Logger } from '../../util/logging/logger';
import { escapeForRegExp, generateRandomId, stripJsComments } from '../../util/utils';
import { TestDefinitionState } from '../base/test-definition';
import { TestInterface } from '../base/test-framework';
import { TestNode, TestNodeType } from '../base/test-node';

export type RegexTestFileParserResult = Record<TestNodeType, TestNode[]>;

export class RegexTestFileParser {
  private disposables: Disposable[] = [];

  public constructor(private readonly testInterface: TestInterface, private readonly logger: Logger) {
    this.disposables.push(logger);
  }

  public parseFileText(fileText: string): RegexTestFileParserResult {
    const parseId = generateRandomId();
    this.logger.trace(() => `Parse operation ${parseId}: Parsing file text: \n${fileText}`);

    const data = this.getTestFileData(fileText);

    const fileInfo: RegexTestFileParserResult = {
      [TestNodeType.Suite]: [],
      [TestNodeType.Test]: []
    };

    const testInterfaceParserRegex = this.getTestNodeRegex(this.testInterface); // TODO: Switch to AST parser
    let matchResult: RegExpExecArray | null;
    let activeLineNumber: number | undefined;

    while ((matchResult = testInterfaceParserRegex.exec(data)) != null) {
      activeLineNumber = matchResult[3] !== undefined ? Number(matchResult[3]) : activeLineNumber;
      const nodeDefinition = this.getNodeTypeAndState(matchResult[4]);
      const testDescription = matchResult[6]?.replace(/\\(['"`])/g, '$1');

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

  private getTestNodeRegex(testInterface: TestInterface): RegExp {
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
    const pattern = `((^|\\n)(\\d+)\\.)?\\s+(${interfaceStrings})\\s*\\(\\s*((?<![\\\\])[\\\`\\'\\"])((?:.(?!(?<![\\\\])\\5))*.?)\\5`;

    return new RegExp(pattern, 'gis');
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
