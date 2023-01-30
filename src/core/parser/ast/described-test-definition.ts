import { TestDefinition } from '../../base/test-definition.js';

export enum DescribedTestDefinitionType {
  String = 'string',
  Pattern = 'pattern'
}

export type DescribedTestDefinition = StringDescribedTestDefinition | PatternDescribedTestDefinition;

export interface StringDescribedTestDefinition extends TestDefinition {
  description: string;
  descriptionType: DescribedTestDefinitionType.String;
}

export interface PatternDescribedTestDefinition extends TestDefinition {
  description: RegExp;
  descriptionType: DescribedTestDefinitionType.Pattern;
}

export interface DescribedTestDefinitionInfo {
  test: DescribedTestDefinition;
  suite: DescribedTestDefinition[];
}
