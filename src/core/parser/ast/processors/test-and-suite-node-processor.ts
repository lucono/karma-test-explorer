import { Node } from '@babel/types';

import { Disposable } from '../../../../util/disposable/disposable.js';
import { Disposer } from '../../../../util/disposable/disposer.js';
import { Logger } from '../../../../util/logging/logger.js';
import { regexJsonReplacer } from '../../../../util/utils.js';
import { TestDefinitionState } from '../../../base/test-definition.js';
import { TestInterface } from '../../../base/test-framework.js';
import { TestType } from '../../../base/test-infos.js';
import { ProcessedSourceNode, SourceNodeDetail, SourceNodeProcessor } from '../source-node-processor.js';
import { TestDescriptionNodeProcessor } from './test-description-node-processor.js';

export class TestAndSuiteNodeProcessor implements SourceNodeProcessor<ProcessedSourceNode> {
  private readonly disposables: Disposable[] = [];
  private readonly suiteTags: string[];
  private readonly testTags: string[];

  public constructor(
    private readonly testInterface: TestInterface,
    private readonly testDescriptionNodeProcessor: TestDescriptionNodeProcessor,
    private readonly logger: Logger
  ) {
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

  public processNode(node: Node): ProcessedSourceNode | undefined {
    if (node.type !== 'ExpressionStatement' || node.expression.type !== 'CallExpression') {
      this.logger.trace(() => `Rejecting source node of type: ${node.type}`);
      return undefined;
    }
    this.logger.trace(() => `Processing source node of type: ${node.type}`);

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
      return undefined;
    }

    const testDefinitionType: TestType | undefined = this.suiteTags.includes(testTag)
      ? TestType.Suite
      : this.testTags.includes(testTag)
      ? TestType.Test
      : undefined;

    if (!testDefinitionType) {
      return undefined;
    }

    const testTags = testDefinitionType === TestType.Suite ? this.testInterface.suiteTags : this.testInterface.testTags;

    const testDefinitionState: TestDefinitionState | undefined = testTags.default.includes(testTag)
      ? TestDefinitionState.Default
      : testTags.focused.includes(testTag)
      ? TestDefinitionState.Focused
      : testTags.disabled.includes(testTag)
      ? TestDefinitionState.Disabled
      : undefined;

    if (!testDefinitionState) {
      return undefined;
    }

    const testDescriptionNode = expressionNode.arguments[0];
    const processedTestDescription = this.testDescriptionNodeProcessor.processNode(testDescriptionNode);

    if (processedTestDescription === undefined) {
      return undefined;
    }

    const locationNode = calleeNode.loc;

    if (!locationNode) {
      return undefined;
    }

    const nodeDetail: SourceNodeDetail = {
      ...processedTestDescription,
      type: testDefinitionType,
      state: testDefinitionState,
      line: locationNode.start.line
    };

    const testImplementationNode = expressionNode.arguments[1];

    const testNodeHasFunctionImplementation =
      testImplementationNode?.type === 'FunctionExpression' ||
      testImplementationNode?.type === 'ArrowFunctionExpression';

    const childNodes =
      testDefinitionType === TestType.Suite &&
      testNodeHasFunctionImplementation &&
      testImplementationNode?.body?.type === 'BlockStatement'
        ? testImplementationNode.body.body
        : [];

    const processedNode: ProcessedSourceNode = {
      nodeDetail,
      childNodes,
      childNodesParameterized: false
    };

    this.logger.trace(
      () =>
        `Successfully processed source node ` +
        `(having ${childNodes?.length ?? 0} child nodes): ` +
        `${JSON.stringify(nodeDetail, regexJsonReplacer, 2)}`
    );
    return processedNode;
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
