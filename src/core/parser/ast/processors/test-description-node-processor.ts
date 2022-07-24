import { Node } from '@babel/core';
import { BinaryExpression, NumericLiteral, TemplateLiteral } from '@babel/types';
import { Disposable } from 'vscode';
import { Disposer } from '../../../../util/disposable/disposer';
import { Logger } from '../../../../util/logging/logger';
import { escapeForRegExp, regexJsonReplacer } from '../../../../util/utils';
import {
  DescribedTestDefinitionType,
  PatternDescribedTestDefinition,
  StringDescribedTestDefinition
} from '../described-test-definition';
import { SourceNodeProcessor } from '../source-node-processor';

type StringOrPattern = { text: string; isPattern: boolean };

export type ProcessedTestDescription =
  | Pick<StringDescribedTestDefinition, 'description' | 'descriptionType'>
  | Pick<PatternDescribedTestDefinition, 'description' | 'descriptionType'>;

export class TestDescriptionNodeProcessor implements SourceNodeProcessor<ProcessedTestDescription> {
  private readonly disposables: Disposable[] = [];

  public constructor(private readonly logger: Logger) {
    this.disposables.push(logger);
  }

  public processNode(node: Node): ProcessedTestDescription | undefined {
    const descriptionStringOrPattern: StringOrPattern | undefined =
      node.type === 'StringLiteral'
        ? { text: node.value, isPattern: false }
        : node.type === 'TemplateLiteral'
        ? this.processTemplateLiteralNode(node)
        : node.type === 'NumericLiteral'
        ? this.processNumericLiteralNode(node)
        : node.type === 'BinaryExpression'
        ? this.processBinaryExpressionNode(node)
        : undefined;

    if (!descriptionStringOrPattern) {
      this.logger.trace(() => `Rejecting source node of type: ${node.type}`);
      return undefined;
    }
    this.logger.trace(() => `Processing source node of type: ${node.type}`);

    const processedDescription: ProcessedTestDescription = descriptionStringOrPattern.isPattern
      ? {
          description: new RegExp(`^${descriptionStringOrPattern.text}$`),
          descriptionType: DescribedTestDefinitionType.Pattern
        }
      : {
          description: descriptionStringOrPattern.text,
          descriptionType: DescribedTestDefinitionType.String
        };

    this.logger.trace(
      () =>
        `Successfully processed source node ` +
        `of type '${node.type}' with result: ` +
        `${JSON.stringify(processedDescription, regexJsonReplacer, 2)}`
    );
    return processedDescription;
  }

  private processTemplateLiteralNode(node: TemplateLiteral): StringOrPattern {
    if (node.quasis.length === 1) {
      const text = node.quasis[0].value.cooked ?? node.quasis[0].value.raw;
      return { text, isPattern: false };
    }
    const templatePattern = node.quasis.map(templateElement => escapeForRegExp(templateElement.value.raw)).join('(.*)');
    return { text: templatePattern, isPattern: true };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private processNumericLiteralNode(node: NumericLiteral): StringOrPattern {
    return { text: `[-+._0-9]+`, isPattern: true };
  }

  private processBinaryExpressionNode(node: BinaryExpression): StringOrPattern {
    const leftNode = node.left;
    const rightNode = node.right;

    const leftStringOrPattern: StringOrPattern =
      leftNode.type === 'StringLiteral'
        ? { text: leftNode.value, isPattern: false }
        : leftNode.type === 'TemplateLiteral'
        ? this.processTemplateLiteralNode(leftNode)
        : leftNode.type === 'NumericLiteral'
        ? this.processNumericLiteralNode(leftNode)
        : leftNode.type === 'BinaryExpression'
        ? this.processBinaryExpressionNode(leftNode)
        : { text: '(.*)', isPattern: true };

    const rightStringOrPattern: StringOrPattern =
      rightNode.type === 'StringLiteral'
        ? { text: rightNode.value, isPattern: false }
        : rightNode.type === 'TemplateLiteral'
        ? this.processTemplateLiteralNode(rightNode)
        : rightNode.type === 'NumericLiteral'
        ? this.processNumericLiteralNode(rightNode)
        : rightNode.type === 'BinaryExpression'
        ? this.processBinaryExpressionNode(rightNode)
        : { text: '(.*)', isPattern: true };

    const combinedStringOrPattern = this.getCombinedStringOrPattern(leftStringOrPattern, rightStringOrPattern);
    return combinedStringOrPattern;
  }

  private getCombinedStringOrPattern(...items: StringOrPattern[]): StringOrPattern {
    const combinationIsPattern = items.some(item => item.isPattern);

    const combinedString = items
      .map(item => (combinationIsPattern && !item.isPattern ? escapeForRegExp(item.text) : item.text))
      .join('');

    const combinedStringOrPattern: StringOrPattern = {
      text: combinedString,
      isPattern: combinationIsPattern
    };
    return combinedStringOrPattern;
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
