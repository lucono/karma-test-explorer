import { Node } from '@babel/types';

import { Disposable } from '../../../util/disposable/disposable.js';
import { PatternDescribedTestDefinition, StringDescribedTestDefinition } from './described-test-definition.js';

export interface SourceNodeProcessor<T> extends Disposable {
  processNode(node: Node): T | undefined;
}

export interface ProcessedSourceNode {
  nodeDetail?: SourceNodeDetail;
  childNodes: Node[];
  childNodesParameterized: boolean;
}

export type SourceNodeDetail =
  | Pick<StringDescribedTestDefinition, 'type' | 'description' | 'descriptionType' | 'state' | 'line'>
  | Pick<PatternDescribedTestDefinition, 'type' | 'description' | 'descriptionType' | 'state' | 'line'>;
