import { Node } from '@babel/core';
import { parse, ParserOptions } from '@babel/parser';
import { Disposable } from '../../../util/disposable/disposable';
import { Disposer } from '../../../util/disposable/disposer';
import { Logger } from '../../../util/logging/logger';
import { generateRandomId } from '../../../util/utils';
import { TestDefinition, TestDefinitionState } from '../../base/test-definition';
import { TestInterface } from '../../base/test-framework';
import { TestType } from '../../base/test-infos';
import { TestDefinitionInfo } from '../../test-locator';

const PARSER_OPTIONS: ParserOptions = {
  errorRecovery: true,
  allowAwaitOutsideFunction: true,
  allowImportExportEverywhere: true,
  allowReturnOutsideFunction: true,
  allowSuperOutsideMethod: true,
  allowUndeclaredExports: true,
  attachComment: false,
  createParenthesizedExpressions: false,
  ranges: false,
  sourceType: 'unambiguous',
  strictMode: false,
  tokens: false,
  startLine: 0,
  plugins: ['typescript', 'jsx']
};

export class AstTestFileParser implements Disposable {
  private disposables: Disposable[] = [];
  private readonly suiteTags: string[];
  private readonly testTags: string[];

  public constructor(private readonly testInterface: TestInterface, private readonly logger: Logger) {
    this.disposables.push(logger);

    this.suiteTags = [
      ...testInterface.suiteTags.default,
      ...testInterface.suiteTags.focused,
      ...testInterface.suiteTags.disabled
    ];
    this.testTags = [
      ...testInterface.testTags.default,
      ...testInterface.testTags.focused,
      ...testInterface.testTags.disabled
    ];
  }

  public parseFileText(fileText: string, fileName: string): TestDefinitionInfo[] {
    const parseId = generateRandomId();
    this.logger.trace(() => `Parse operation ${parseId}: Parsing file '${fileName}' having content: \n${fileText}`);

    const startTime = new Date();
    const parsedFile = parse(fileText, PARSER_OPTIONS);

    if (parsedFile.errors.length > 0) {
      const errorMessages = parsedFile.errors.map(error => `--> ${error.code} - ${error.reasonCode}`);

      this.logger.trace(
        () =>
          `Parse operation ${parseId}: ` +
          `Encountered errors while parsing file '${fileName}': ` +
          `\n${errorMessages.join('\n')}`
      );
    }
    const testDefinitionInfos = this.getTestDefinitionFromStatementNodes(parsedFile.program.body, fileName);
    const elapsedTime = (Date.now() - startTime.getTime()) / 1000;

    this.logger.debug(
      () =>
        `Parse operation ${parseId}: ` +
        `Parsed ${testDefinitionInfos.length} total tests ` +
        `from file '${fileName}' ` +
        `in ${elapsedTime.toFixed(2)} secs`
    );
    return testDefinitionInfos;
  }

  private getTestDefinitionFromStatementNodes(
    nodes: Node[],
    fileName: string,
    derivedParentSuiteDefinitionState: TestDefinitionState = TestDefinitionState.Default
  ): TestDefinitionInfo[] {
    const testDefinitionInfos = nodes
      .map((node): TestDefinitionInfo[] => {
        if (node.type !== 'ExpressionStatement' || node.expression.type !== 'CallExpression') {
          return [];
        }
        const expressionNode = node.expression;
        const calleeNode = expressionNode.callee;

        const testTag: string | undefined =
          calleeNode.type === 'Identifier'
            ? calleeNode.name
            : calleeNode.type === 'MemberExpression' &&
              calleeNode.object.type === 'Identifier' &&
              calleeNode.property.type === 'Identifier'
            ? `${calleeNode.object.name}.${calleeNode.property.name}`
            : undefined;

        if (!testTag) {
          return [];
        }

        const testDefinitionType: TestType | undefined = this.suiteTags.includes(testTag)
          ? TestType.Suite
          : this.testTags.includes(testTag)
          ? TestType.Test
          : undefined;

        if (!testDefinitionType) {
          return [];
        }

        const testTags =
          testDefinitionType === TestType.Suite ? this.testInterface.suiteTags : this.testInterface.testTags;

        const testDefinitionState: TestDefinitionState | undefined = testTags.default.includes(testTag)
          ? TestDefinitionState.Default
          : testTags.focused.includes(testTag)
          ? TestDefinitionState.Focused
          : testTags.disabled.includes(testTag)
          ? TestDefinitionState.Disabled
          : undefined;

        if (!testDefinitionState) {
          return [];
        }

        const testDescriptionNode = expressionNode.arguments[0];

        const testDescription: string | undefined =
          testDescriptionNode?.type === 'StringLiteral'
            ? testDescriptionNode.value
            : testDescriptionNode?.type === 'TemplateLiteral' && testDescriptionNode.quasis.length === 1
            ? testDescriptionNode.quasis[0].value.raw
            : undefined;

        if (testDescription === undefined) {
          return [];
        }

        const locationNode = calleeNode.loc;

        if (!locationNode) {
          return [];
        }

        const derivedSuiteDefinitionState =
          testDefinitionState === TestDefinitionState.Default ? derivedParentSuiteDefinitionState : testDefinitionState;

        const testDefinition: TestDefinition = {
          type: testDefinitionType,
          description: testDescription,
          state: testDefinitionState,
          disabled: derivedSuiteDefinitionState === TestDefinitionState.Disabled,
          file: fileName,
          line: locationNode.start.line
        };

        if (testDefinitionType === TestType.Test) {
          const testDefinitionInfo: TestDefinitionInfo = {
            test: testDefinition,
            suite: []
          };
          return [testDefinitionInfo];
        }

        const testImplementationNode = expressionNode.arguments[1];

        if (
          (testImplementationNode?.type !== 'FunctionExpression' &&
            testImplementationNode?.type !== 'ArrowFunctionExpression') ||
          testImplementationNode?.body?.type !== 'BlockStatement'
        ) {
          return [];
        }

        const childStatementNodes = testImplementationNode.body.body;

        const childTestDefinitionInfos = this.getTestDefinitionFromStatementNodes(
          childStatementNodes,
          fileName,
          derivedSuiteDefinitionState
        );

        if (!childTestDefinitionInfos || childTestDefinitionInfos.length === 0) {
          return [];
        }

        childTestDefinitionInfos.forEach(childTestDefinitionInfo =>
          childTestDefinitionInfo.suite.unshift(testDefinition)
        );

        return childTestDefinitionInfos;
      })
      .reduce((accummulatedDefinitions, currentDefinitions) => [...accummulatedDefinitions, ...currentDefinitions], []);

    return testDefinitionInfos;
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
