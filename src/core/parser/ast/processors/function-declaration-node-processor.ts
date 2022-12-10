import { Node } from '@babel/core';
import { Disposable } from 'vscode';
import { Disposer } from '../../../../util/disposable/disposer';
import { Logger } from '../../../../util/logging/logger';
import { ProcessedSourceNode, SourceNodeProcessor } from '../source-node-processor';

export class FunctionDeclarationNodeProcessor implements SourceNodeProcessor<ProcessedSourceNode> {
  private readonly disposables: Disposable[] = [];

  public constructor(private readonly logger: Logger) {
    this.disposables.push(logger);
  }

  public processNode(node: Node): ProcessedSourceNode | undefined {
    if (node.type !== 'FunctionDeclaration') {
      this.logger.trace(() => `Rejecting source node of type: ${node.type}`);
      return undefined;
    }
    this.logger.trace(() => `Processing source node of type: ${node.type}`);

    const childNodes: Node[] = [...node.params, node.body]
      .map(node => (node.type === 'BlockStatement' ? node.body : []))
      .reduce((allNodes, newNodes) => [...allNodes, ...newNodes], []);

    const processedNode: ProcessedSourceNode = { childNodes };

    this.logger.trace(
      () => `Successfully processed source node of type '${node.type}' to ${childNodes?.length ?? 0} child nodes`
    );
    return processedNode;
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
