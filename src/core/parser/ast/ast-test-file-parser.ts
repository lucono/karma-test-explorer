import { Node } from '@babel/core';
import { parse, ParserOptions } from '@babel/parser';
import { Disposable } from '../../../util/disposable/disposable';
import { Disposer } from '../../../util/disposable/disposer';
import { Logger } from '../../../util/logging/logger';
import { generateRandomId, regexJsonReplacer } from '../../../util/utils';
import { TestDefinitionState } from '../../base/test-definition';
import { TestType } from '../../base/test-infos';
import { TestFileParser } from '../test-file-parser';
import { DescribedTestDefinition, DescribedTestDefinitionInfo } from './described-test-definition';
import { ProcessedSourceNode, SourceNodeProcessor } from './source-node-processor';

const PARSER_OPTIONS: ParserOptions = {
  errorRecovery: true,
  allowAwaitOutsideFunction: true,
  allowImportExportEverywhere: true,
  allowReturnOutsideFunction: true,
  allowSuperOutsideMethod: true,
  allowUndeclaredExports: true,
  attachComment: false,
  createParenthesizedExpressions: false,
  ranges: false,
  sourceType: 'unambiguous',
  strictMode: false,
  tokens: false,
  startLine: 0,
  plugins: ['typescript', 'jsx']
};

export class AstTestFileParser implements TestFileParser<DescribedTestDefinitionInfo[]> {
  private readonly disposables: Disposable[] = [];
  private readonly nodeProcessors: SourceNodeProcessor<ProcessedSourceNode>[];

  public constructor(nodeProcessors: SourceNodeProcessor<ProcessedSourceNode>[], private readonly logger: Logger) {
    this.disposables.push(logger);
    this.nodeProcessors = [...nodeProcessors];
  }

  public parseFileText(fileText: string, filePath: string): DescribedTestDefinitionInfo[] {
    const parseId = generateRandomId();
    this.logger.trace(() => `Parse operation ${parseId}: Parsing file '${filePath}' having content: \n${fileText}`);

    const startTime = new Date();
    const parsedFile = parse(fileText, PARSER_OPTIONS);

    if (parsedFile.errors.length > 0) {
      const errorMessages = parsedFile.errors.map(error => `--> ${error.code} - ${error.reasonCode}`);

      this.logger.trace(
        () =>
          `Parse operation ${parseId}: ` +
          `Encountered errors while parsing file '${filePath}': ` +
          `\n${errorMessages.join('\n')}`
      );
    }
    const testDefinitionInfos = this.getTestDefinitionsFromNodes(parsedFile.program.body, filePath);
    const elapsedTime = (Date.now() - startTime.getTime()) / 1000;

    this.logger.debug(
      () =>
        `Parse operation ${parseId}: ` +
        `Parsed ${testDefinitionInfos.length} total tests ` +
        `from file '${filePath}' ` +
        `in ${elapsedTime.toFixed(2)} secs`
    );
    return testDefinitionInfos;
  }

  private getTestDefinitionsFromNodes(
    nodes: Node[] | undefined,
    filePath: string,
    derivedParentSuiteDefinitionState: TestDefinitionState = TestDefinitionState.Default
  ): DescribedTestDefinitionInfo[] {
    if (!nodes) {
      return [];
    }
    const testDefinitionInfos = nodes
      .map((node): DescribedTestDefinitionInfo[] => {
        const processedNode = this.processNode(node);

        if (!processedNode?.nodeDetail && !processedNode?.childNodes) {
          return [];
        }
        const { nodeDetail, childNodes } = processedNode;

        const derivedTestDefinitionState = nodeDetail
          ? nodeDetail.state === TestDefinitionState.Default
            ? derivedParentSuiteDefinitionState
            : nodeDetail.state
          : derivedParentSuiteDefinitionState;

        let testDefinition: DescribedTestDefinition | undefined;

        if (nodeDetail) {
          testDefinition = {
            ...nodeDetail,
            file: filePath,
            disabled: derivedTestDefinitionState === TestDefinitionState.Disabled
          };
        }

        const childTestDefinitionInfos = this.getTestDefinitionsFromNodes(
          childNodes,
          filePath,
          derivedTestDefinitionState
        );

        if (!testDefinition) {
          return childTestDefinitionInfos;
        }

        this.logger.trace(
          () => `Including parsed test definition: ${JSON.stringify(testDefinition, regexJsonReplacer, 2)}`
        );

        if (testDefinition.type === TestType.Test) {
          const testDefinitionInfo: DescribedTestDefinitionInfo = {
            test: testDefinition,
            suite: []
          };
          return [testDefinitionInfo];
        }

        for (const childTestDefinitionInfo of childTestDefinitionInfos) {
          childTestDefinitionInfo.suite.unshift(testDefinition);
        }
        return childTestDefinitionInfos;
      })
      .reduce((accummulatedDefinitions, currentDefinitions) => [...accummulatedDefinitions, ...currentDefinitions], []);

    return testDefinitionInfos;
  }

  private processNode(node: Node): ProcessedSourceNode | undefined {
    let processedNodeResult: ProcessedSourceNode | undefined;

    for (const nodeProcessor of this.nodeProcessors) {
      processedNodeResult = nodeProcessor.processNode(node);
      if (processedNodeResult) {
        break;
      }
    }
    return processedNodeResult;
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
