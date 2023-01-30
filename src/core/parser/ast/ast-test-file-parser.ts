import { ParseError, ParseResult, ParserOptions, ParserPlugin, ParserPluginWithOptions, parse } from '@babel/parser';
import { File, Node } from '@babel/types';

import { Disposable } from '../../../util/disposable/disposable.js';
import { Disposer } from '../../../util/disposable/disposer.js';
import { Logger } from '../../../util/logging/logger.js';
import { generateRandomId, regexJsonReplacer } from '../../../util/utils.js';
import { TestDefinitionState } from '../../base/test-definition.js';
import { TestType } from '../../base/test-infos.js';
import { TestFileParser } from '../test-file-parser.js';
import { DescribedTestDefinition, DescribedTestDefinitionInfo } from './described-test-definition.js';
import { ProcessedSourceNode, SourceNodeProcessor } from './source-node-processor.js';

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

const DEFAULT_PARSER_PLUGINS: ParserPlugin[] = ['typescript', 'jsx', 'decorators'];

const PARSER_PLUGINS_WITH_OPTIONS: Map<ParserPlugin, ParserPluginWithOptions> = new Map([
  ['typescript', ['typescript', { disallowAmbiguousJSXLike: false }]],
  ['decorators', ['decorators', { decoratorsBeforeExport: false }]]
]);

interface ParseFailure extends ParseError {
  loc?: { line: number; column: number };
}

export interface AstTestFileParserOptions {
  readonly enabledParserPlugins?: readonly ParserPlugin[];
  readonly useLenientMode?: boolean;
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
    const parseFailureErrors: Set<string> = new Set();
    const startTime = new Date();

    this.logger.trace(() => `Parse operation ${parseId}: Parsing file '${filePath}' having content: \n${fileText}`);

    const executeParse = (enforceFileType: boolean): ParseResult<File> | undefined => {
      const enabledParserPlugins = enforceFileType ? this.getParserPlugins(filePath) : this.getParserPlugins();
      const parserOptions = { ...DEFAULT_PARSER_OPTIONS, plugins: enabledParserPlugins };
      let parseResult: ParseResult<File> | undefined;

      this.logger.trace(
        () =>
          `Parse operation ${parseId}: ` +
          `Parsing file '${filePath}' using parser plugins: ` +
          `${JSON.stringify(parserOptions.plugins || [])}`
      );

      try {
        parseResult = parse(fileText, parserOptions);

        if (parseResult.errors.length > 0) {
          const errorMessages = parseResult.errors
            .map(error => this.getErrorMsgWithSourceSnippet(error as ParseFailure, fileText))
            .join('\n');

          this.logger.trace(
            () =>
              `Parse operation ${parseId}: ` +
              `Encountered errors while parsing file '${filePath}' using parser plugins: ` +
              `${JSON.stringify(parserOptions.plugins || [])}:` +
              `${errorMessages}`
          );
        }
      } catch (error) {
        const errorMsg = this.getErrorMsgWithSourceSnippet(error as ParseFailure, fileText);

        this.logger.warn(
          () =>
            `Parse operation ${parseId}: ` +
            `Error parsing file '${filePath}' using parser plugins: ` +
            `${JSON.stringify(parserOptions.plugins || [])}:` +
            `${errorMsg}`
        );
        parseFailureErrors.add(errorMsg);
      }
      return parseResult;
    };

    let parsedFile = executeParse(true);

    if (!parsedFile && this.options.useLenientMode) {
      // FIXME: Don't re-parse if equivalent to same set of plugins used in first parse
      parsedFile = executeParse(false);
    }

    if (!parsedFile) {
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
    nodes: Node[],
    filePath: string,
    derivedParentSuiteDefinitionState: TestDefinitionState = TestDefinitionState.Default,
    isParameterized: boolean = false
  ): DescribedTestDefinitionInfo[] {
    if (nodes.length === 0) {
      return [];
    }
    const testDefinitionInfos = nodes
      .map((node): DescribedTestDefinitionInfo[] => {
        const processedNode = this.processNode(node);

        if (!processedNode) {
          return [];
        }
        const { nodeDetail, childNodes, childNodesParameterized } = processedNode;

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
            parameterized: isParameterized,
            disabled: derivedTestDefinitionState === TestDefinitionState.Disabled
          };
        }

        const childTestDefinitionInfos = this.getTestDefinitionsFromNodes(
          childNodes,
          filePath,
          derivedTestDefinitionState,
          isParameterized || childNodesParameterized
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
    const fileSupportsTypeScriptContent = filePath ? !!filePath.match(/^.+\.(ts|tsx)$/) : true;
    const fileSupportsJsxContent = filePath ? !!filePath.match(/^.+\.(js|jsx|tsx)$/) : true;
    const parserPlugins = this.options.enabledParserPlugins ?? DEFAULT_PARSER_PLUGINS;

    const pluginsWithOptions: ParserPlugin[] = parserPlugins
      .filter(pluginName =>
        pluginName === 'typescript'
          ? fileSupportsTypeScriptContent
          : pluginName === 'jsx'
          ? fileSupportsJsxContent
          : true
      )
      .map(pluginName => PARSER_PLUGINS_WITH_OPTIONS.get(pluginName) ?? pluginName);

    return pluginsWithOptions;
  }

  private getErrorMsgWithSourceSnippet(error: ParseFailure, fileText: string): string {
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
