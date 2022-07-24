import { Node } from '@babel/core';
import { Disposable } from '../../../util/disposable/disposable';
import { PatternDescribedTestDefinition, StringDescribedTestDefinition } from './described-test-definition';

export interface SourceNodeProcessor<T> extends Disposable {
  processNode(node: Node): T | undefined;
}

export interface ProcessedSourceNode {
  nodeDetail?: SourceNodeDetail;
  childNodes?: Node[];
}

export type SourceNodeDetail =
  | Pick<StringDescribedTestDefinition, 'type' | 'description' | 'descriptionType' | 'state' | 'line'>
  | Pick<PatternDescribedTestDefinition, 'type' | 'description' | 'descriptionType' | 'state' | 'line'>;
