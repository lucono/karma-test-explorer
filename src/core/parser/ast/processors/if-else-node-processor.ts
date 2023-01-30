import { IfStatement, Node } from '@babel/types';

import { Disposable } from '../../../../util/disposable/disposable.js';
import { Disposer } from '../../../../util/disposable/disposer.js';
import { Logger } from '../../../../util/logging/logger.js';
import { ProcessedSourceNode, SourceNodeProcessor } from '../source-node-processor.js';

export class IfElseNodeProcessor implements SourceNodeProcessor<ProcessedSourceNode> {
  private readonly disposables: Disposable[] = [];

  public constructor(private readonly logger: Logger) {
    this.disposables.push(logger);
  }

  public processNode(node: Node): ProcessedSourceNode | undefined {
    if (node.type !== 'IfStatement') {
      this.logger.trace(() => `Rejecting source node of type: ${node.type}`);
      return undefined;
    }
    this.logger.trace(() => `Processing source node of type: ${node.type}`);

    const childNodes = this.processIfStatementNode(node);
    const processedNode: ProcessedSourceNode = { childNodes, childNodesParameterized: false };

    this.logger.trace(
      () => `Successfully processed source node of type '${node.type}' to ${childNodes?.length ?? 0} child nodes`
    );
    return processedNode;
  }

  private processIfStatementNode(node: IfStatement): Node[] {
    const ifNode = node.consequent;
    const elseNode = node.alternate;

    const ifNodeChildren: Node[] =
      ifNode.type === 'BlockStatement'
        ? ifNode.body
        : ifNode.type === 'IfStatement'
        ? this.processIfStatementNode(ifNode)
        : [];

    const elseNodeChildren: Node[] =
      elseNode?.type === 'BlockStatement'
        ? elseNode.body
        : elseNode?.type === 'IfStatement'
        ? this.processIfStatementNode(elseNode)
        : [];

    const combinedChildNodes = [...ifNodeChildren, ...elseNodeChildren];
    return combinedChildNodes;
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
