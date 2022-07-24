import { Node } from '@babel/core';
import { Disposable } from 'vscode';
import { Disposer } from '../../../../util/disposable/disposer';
import { Logger } from '../../../../util/logging/logger';
import { ProcessedSourceNode, SourceNodeProcessor } from '../source-node-processor';

export class ForLoopNodeProcessor implements SourceNodeProcessor<ProcessedSourceNode> {
  private readonly disposables: Disposable[] = [];

  public constructor(private readonly logger: Logger) {
    this.disposables.push(logger);
  }

  public processNode(node: Node): ProcessedSourceNode | undefined {
    const nodeIsForLoopVariant =
      node.type === 'ForStatement' || node.type === 'ForInStatement' || node.type === 'ForOfStatement';

    if (!nodeIsForLoopVariant || node.body.type !== 'BlockStatement') {
      this.logger.trace(() => `Rejecting source node of type: ${node.type}`);
      return undefined;
    }
    this.logger.trace(() => `Processing source node of type: ${node.type}`);
    const childNodes = node.body.body;

    const processedNode: ProcessedSourceNode = {
      childNodes: childNodes
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
