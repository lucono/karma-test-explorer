import { Node } from '@babel/types';

import { Disposable } from '../../../../util/disposable/disposable.js';
import { Disposer } from '../../../../util/disposable/disposer.js';
import { Logger } from '../../../../util/logging/logger.js';
import { ProcessedSourceNode, SourceNodeProcessor } from '../source-node-processor.js';

export class ForEachNodeProcessor implements SourceNodeProcessor<ProcessedSourceNode> {
  private readonly disposables: Disposable[] = [];

  public constructor(private readonly logger: Logger) {
    this.disposables.push(logger);
  }

  public processNode(node: Node): ProcessedSourceNode | undefined {
    if (node.type !== 'ExpressionStatement' || node.expression.type !== 'CallExpression') {
      this.logger.trace(() => `Rejecting source node of type: ${node.type}`);
      return undefined;
    }
    this.logger.trace(() => `Processing source node of type: ${node.type}`);

    const expressionNode = node.expression;
    const calleeNode = expressionNode.callee;

    const isForEachExpression =
      calleeNode.type === 'MemberExpression' &&
      calleeNode.property.type === 'Identifier' &&
      calleeNode.property.name === 'forEach';

    if (!isForEachExpression) {
      return undefined;
    }

    const testImplementationNode = expressionNode.arguments[0];

    const testNodeHasFunctionImplementation =
      testImplementationNode?.type === 'FunctionExpression' ||
      testImplementationNode?.type === 'ArrowFunctionExpression';

    const childNodes =
      testNodeHasFunctionImplementation && testImplementationNode?.body?.type === 'BlockStatement'
        ? testImplementationNode.body.body
        : undefined;

    const processedNode: ProcessedSourceNode = {
      childNodes: childNodes ?? [],
      childNodesParameterized: true
    };

    this.logger.trace(
      () => `Successfully processed source node of type '${node.type}' to ${childNodes?.length ?? 0} child nodes`
    );
    return processedNode;
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
