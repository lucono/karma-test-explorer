import { Node } from '@babel/core';
import { parse, ParseError, ParseResult, ParserOptions, ParserPlugin, ParserPluginWithOptions } from '@babel/parser';
import { File } from '@babel/types';
import { Disposable } from '../../../util/disposable/disposable';
import { Disposer } from '../../../util/disposable/disposer';
import { Logger } from '../../../util/logging/logger';
import { generateRandomId, regexJsonReplacer } from '../../../util/utils';
import { TestDefinitionState } from '../../base/test-definition';
import { TestType } from '../../base/test-infos';
import { TestFileParser } from '../test-file-parser';
import { DescribedTestDefinition, DescribedTestDefinitionInfo } from './described-test-definition';
import { ProcessedSourceNode, SourceNodeProcessor } from './source-node-processor';

const DEFAULT_PARSER_OPTIONS: ParserOptions = {
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
  startLine: 0
};

const PLUGINS_WITH_OPTIONS: Map<ParserPlugin, ParserPluginWithOptions> = new Map([
  ['typescript', ['typescript', { disallowAmbiguousJSXLike: false }]],
  ['decorators', ['decorators', { decoratorsBeforeExport: false }]]
]);

interface ParseFailureError extends ParseError {
  loc?: { line: number; column: number };
}

export interface AstTestFileParserOptions {
  readonly enabledParserPlugins?: readonly ParserPlugin[];
}

export class AstTestFileParser implements TestFileParser<DescribedTestDefinitionInfo[]> {
  private readonly disposables: Disposable[] = [];
  private readonly nodeProcessors: SourceNodeProcessor<ProcessedSourceNode>[];

  public constructor(
    nodeProcessors: SourceNodeProcessor<ProcessedSourceNode>[],
    private readonly logger: Logger,
    private readonly options: AstTestFileParserOptions = {}
  ) {
    this.disposables.push(logger);
    this.nodeProcessors = [...nodeProcessors];
  }

  public parseFileText(fileText: string, filePath: string): DescribedTestDefinitionInfo[] {
    const parseId = generateRandomId();
    const startTime = new Date();
    this.logger.trace(() => `Parse operation ${parseId}: Parsing file '${filePath}' having content: \n${fileText}`);

    const parseAttemptsParamsList: [string?][] = [[filePath], []];
    const parseFailureErrors: Set<string> = new Set();
    let parsedFile: ParseResult<File> | undefined;

    for (const parseAttemptParams of parseAttemptsParamsList) {
      const enabledParserPlugins = this.getParserPlugins(...parseAttemptParams);
      const parserOptions = { ...DEFAULT_PARSER_OPTIONS, plugins: enabledParserPlugins };

      this.logger.trace(
        () =>
          `Parse operation ${parseId}: ` +
          `Parsing file '${filePath}' using parser plugins: ` +
          `${JSON.stringify(parserOptions.plugins || [])}`
      );

      try {
        parsedFile = parse(fileText, parserOptions);

        if (parsedFile.errors.length > 0) {
          const errorMessages = parsedFile.errors
            .map(error => this.getErrorMsgWithSourceSnippet(error as ParseFailureError, fileText))
            .join('\n');

          this.logger.trace(
            () =>
              `Parse operation ${parseId}: ` +
              `Encountered errors while parsing file '${filePath}':` +
              `${errorMessages}`
          );
        }
        break;
      } catch (error) {
        const errorMsg = this.getErrorMsgWithSourceSnippet(error as ParseFailureError, fileText);

        this.logger.warn(
          () =>
            `Parse operation ${parseId}: ` +
            `Error parsing file '${filePath}' using parser plugins: ` +
            `${JSON.stringify(parserOptions.plugins || [])}:` +
            `${errorMsg}\n` +
            `(Does file extension accurately reflect type of file contents?)`
        );
        parseFailureErrors.add(errorMsg);
      }
    }

    if (parsedFile === undefined) {
      const errorMessages = [...parseFailureErrors].join('\n');
      throw new Error(
        `Parse operation ${parseId}: Error parsing file '${filePath}'` + (errorMessages ? `: ${errorMessages}` : '')
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

  private getParserPlugins(filePath?: string): ParserPlugin[] {
    const fileSupportsJsxContent = filePath ? !!filePath.match(/^.+\.(js|jsx|tsx)$/) : true;
    const fileSupportsTypeScriptContent = filePath ? !!filePath.match(/^.+\.(ts|tsx)$/) : true;

    const parserPlugins: readonly ParserPlugin[] = this.options.enabledParserPlugins ?? [
      'typescript',
      'jsx',
      'decorators'
    ];

    const pluginsWithOptions: ParserPlugin[] = parserPlugins
      .filter(pluginName =>
        pluginName === 'jsx'
          ? fileSupportsJsxContent
          : pluginName === 'typescript'
          ? fileSupportsTypeScriptContent
          : true
      )
      .map(pluginName => PLUGINS_WITH_OPTIONS.get(pluginName) ?? pluginName);

    return pluginsWithOptions;
  }

  private getErrorMsgWithSourceSnippet(error: ParseFailureError, fileText: string): string {
    const sourceSnippet = error.loc
      ? `${fileText.split('\n')[error.loc.line]}\n${' '.repeat(error.loc.column)}^`
      : undefined;

    const errorSourceSnippet = `\n-----\n${error}` + (sourceSnippet ? `:\n${sourceSnippet}` : '');
    return errorSourceSnippet;
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
