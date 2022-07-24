import { Node } from '@babel/core';
import { BinaryExpression, ConditionalExpression, NumericLiteral, TemplateLiteral } from '@babel/types';
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
    this.logger.trace(() => `Processing description node of type: ${node.type}`);

    const descriptionStringOrPattern = this.getNodeStringOrPattern(node);

    if (!descriptionStringOrPattern) {
      this.logger.trace(() => `Rejecting description node of type: ${node.type}`);
      return undefined;
    }

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
        `Successfully processed description node ` +
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

    const expressionsStringOrPatterns = node.expressions.map(
      expression => this.getNodeStringOrPattern(expression) ?? { text: '(.*)', isPattern: true }
    );

    const quasisStringOrPatterns: StringOrPattern[] = node.quasis.map(quasi => ({
      text: quasi.value.cooked ?? quasi.value.raw,
      isPattern: false
    }));

    const templateSegments = quasisStringOrPatterns
      .map((segment, index) => (index === 0 ? [segment] : [expressionsStringOrPatterns[index - 1], segment]))
      .reduce((combinedSegments, nextSegments) => [...combinedSegments, ...nextSegments], []);

    const combinedStringOrPattern = this.getJoinedStringOrPattern(...templateSegments);
    return combinedStringOrPattern;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private processNumericLiteralNode(node: NumericLiteral): StringOrPattern {
    return { text: `${node.value}`, isPattern: false };
  }

  private processConditionalExpressionNode(node: ConditionalExpression): StringOrPattern | undefined {
    const ifBranchStringOrPattern = this.getNodeStringOrPattern(node.consequent);
    const elseBranchStringOrPattern = this.getNodeStringOrPattern(node.alternate);

    if (!ifBranchStringOrPattern || !elseBranchStringOrPattern) {
      return undefined;
    }
    const hasPatternBranch = ifBranchStringOrPattern.isPattern || elseBranchStringOrPattern.isPattern;

    const branchStrings = [ifBranchStringOrPattern, elseBranchStringOrPattern].map(branchValue =>
      hasPatternBranch && !branchValue.isPattern ? escapeForRegExp(branchValue.text) : branchValue.text
    );

    const combinedStringOrPattern: StringOrPattern = {
      text: `(${branchStrings.join('|')})`,
      isPattern: true
    };
    return combinedStringOrPattern;
  }

  private processBinaryExpressionNode(node: BinaryExpression): StringOrPattern {
    if (node.operator !== '+') {
      return { text: '(.*)', isPattern: true };
    }
    const leftStringOrPattern = this.getNodeStringOrPattern(node.left) ?? { text: '(.*)', isPattern: true };
    const rightStringOrPattern = this.getNodeStringOrPattern(node.right) ?? { text: '(.*)', isPattern: true };
    const joinedStringOrPattern = this.getJoinedStringOrPattern(leftStringOrPattern, rightStringOrPattern);
    return joinedStringOrPattern;
  }

  private getNodeStringOrPattern(node: Node): StringOrPattern | undefined {
    const nodeStringOrPattern: StringOrPattern | undefined =
      node.type === 'StringLiteral'
        ? { text: node.value, isPattern: false }
        : node.type === 'TemplateLiteral'
        ? this.processTemplateLiteralNode(node)
        : node.type === 'NumericLiteral'
        ? this.processNumericLiteralNode(node)
        : node.type === 'BinaryExpression'
        ? this.processBinaryExpressionNode(node)
        : node.type === 'ConditionalExpression'
        ? this.processConditionalExpressionNode(node)
        : undefined;

    return nodeStringOrPattern;
  }

  private getJoinedStringOrPattern(...items: StringOrPattern[]): StringOrPattern {
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
