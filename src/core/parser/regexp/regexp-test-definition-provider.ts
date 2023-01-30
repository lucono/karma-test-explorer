import { Disposable } from '../../../util/disposable/disposable.js';
import { Disposer } from '../../../util/disposable/disposer.js';
import { Logger } from '../../../util/logging/logger.js';
import { TestDefinitionProvider } from '../../base/test-definition-provider.js';
import { TestDefinition, TestDefinitionState } from '../../base/test-definition.js';
import { TestType } from '../../base/test-infos.js';
import { TestDefinitionInfo } from '../../test-locator.js';
import { RegexpTestFileParser, RegexpTestFileParserResult } from './regexp-test-file-parser.js';
import { TestNode, TestNodeType } from './test-node.js';

export class RegexpTestDefinitionProvider implements TestDefinitionProvider {
  private readonly fileInfoMap: Map<string, RegexpTestFileParserResult> = new Map();
  private readonly specFilesBySuite: Map<string, string[]> = new Map();
  private readonly disposables: Disposable[] = [];

  public constructor(private readonly testFileParser: RegexpTestFileParser, private readonly logger: Logger) {
    this.disposables.push(testFileParser, logger);
  }

  public addFileContent(fileText: string, filePath: string): void {
    this.logger.trace(() => `Processing spec file: ${filePath}`);

    this.removeFileContents([filePath]);

    const fileTestInfo = this.testFileParser.parseFileText(fileText, filePath);
    this.fileInfoMap.set(filePath, fileTestInfo);

    if (fileTestInfo[TestNodeType.Suite].length === 0) {
      this.logger.warn(() => `No tests found in spec file: ${filePath}`);
      return;
    }
    this.logger.debug(() => `Found ${fileTestInfo[TestNodeType.Test].length} test(s) in spec file: ${filePath}`);

    const fileTopSuite = [fileTestInfo[TestNodeType.Suite][0].description];
    this.addSuiteFileToCache(fileTopSuite, filePath);
  }

  public removeFileContents(filePaths: readonly string[]) {
    filePaths.forEach(fileToPurge => {
      if (!this.fileInfoMap.has(fileToPurge)) {
        return;
      }
      this.fileInfoMap.delete(fileToPurge);

      [...this.specFilesBySuite.entries()].forEach((suiteToFilesEntry: [string, string[]]) => {
        const [suite, files] = suiteToFilesEntry;
        const fileIndex = files.indexOf(fileToPurge);

        if (fileIndex === -1) {
          return;
        }

        if (files.length > 1) {
          files.splice(files.indexOf(fileToPurge), 1);
        } else {
          this.specFilesBySuite.delete(suite);
        }
      });
    });
  }

  public clearAllContent(): void {
    this.fileInfoMap.clear();
    this.specFilesBySuite.clear();
  }

  public getTestDefinitions(specSuite: string[], specDescription: string): TestDefinitionInfo[] {
    const testDefinitionResults: TestDefinitionInfo[] = [];

    if (specSuite.length === 0) {
      return testDefinitionResults;
    }
    const specFiles = this.getSuiteFilesFromCache(specSuite);

    if (specFiles) {
      specFiles.forEach(specFile => {
        const testDefinitionsForSpecFile = this.getTestDefinitionsForFile(specFile, specSuite, specDescription);
        testDefinitionResults.push(...testDefinitionsForSpecFile);
      });
    } else {
      for (const specFile of this.fileInfoMap.keys()) {
        const testDefinitionsForSpecFile = this.getTestDefinitionsForFile(specFile, specSuite, specDescription);

        if (testDefinitionsForSpecFile.length > 0) {
          this.addSuiteFileToCache(specSuite, specFile);
          testDefinitionResults.push(...testDefinitionsForSpecFile);
        }
      }
    }

    return testDefinitionResults;
  }

  private getTestDefinitionsForFile(
    filePath: string,
    specSuite: string[],
    specDescription: string
  ): TestDefinitionInfo[] {
    const testDefinitionNodeResult = this.getTestDefinitionNode(
      this.fileInfoMap.get(filePath),
      specSuite,
      specDescription
    );

    if (!testDefinitionNodeResult) {
      return [];
    }

    const suiteNodes = testDefinitionNodeResult.suiteNodes;
    const suiteDefinitions: TestDefinition[] = [];
    let activeSuiteDefinitionState = TestDefinitionState.Default;

    suiteNodes.forEach(suiteNode => {
      activeSuiteDefinitionState =
        suiteNode.state === TestDefinitionState.Default ? activeSuiteDefinitionState : suiteNode.state;

      const suiteDefinition: TestDefinition = {
        type: TestType.Suite,
        file: filePath,
        line: suiteNode.line,
        state: suiteNode.state,
        parameterized: false,
        disabled: activeSuiteDefinitionState === TestDefinitionState.Disabled
      };
      suiteDefinitions.push(suiteDefinition);
    });

    const testNode = testDefinitionNodeResult.testNode;

    const testDefinitionState =
      testNode.state === TestDefinitionState.Default ? activeSuiteDefinitionState : testNode.state;

    const testDefinition: TestDefinition = {
      type: TestType.Test,
      file: filePath,
      line: testNode.line,
      state: testNode.state,
      parameterized: false,
      disabled: testDefinitionState === TestDefinitionState.Disabled
    };

    const testDefinitionInfo: TestDefinitionInfo = { test: testDefinition, suite: suiteDefinitions };

    return [testDefinitionInfo];
  }

  private getTestDefinitionNode(
    testFileNodeList: RegexpTestFileParserResult | undefined,
    testSuite: readonly string[],
    testDescription: string
  ): { testNode: Readonly<TestNode>; suiteNodes: Readonly<TestNode>[] } | undefined {
    if (!testFileNodeList) {
      return undefined;
    }

    const findNode = (
      nodeType: TestNodeType,
      nodeDescription: string,
      startNode?: TestNode,
      inclusive: boolean = false
    ): Readonly<TestNode> | undefined => {
      const nodeList = testFileNodeList[nodeType];
      let searchIndex = startNode ? nodeList.indexOf(startNode) + (inclusive ? 0 : 1) : 0;

      while (searchIndex < nodeList.length) {
        const node = nodeList[searchIndex];

        if (node.description === nodeDescription) {
          return node;
        }
        searchIndex++;
      }
      return undefined;
    };

    const suiteNamesToFind = testSuite ?? [];
    const suiteNodes: TestNode[] = [];

    let lastFoundSuiteNode: TestNode | undefined;

    for (const suiteName of suiteNamesToFind) {
      const nextSuiteNode = findNode(TestNodeType.Suite, suiteName, lastFoundSuiteNode, false);

      if (!nextSuiteNode) {
        return undefined;
      }
      suiteNodes.push(nextSuiteNode);

      lastFoundSuiteNode = nextSuiteNode;
    }

    const testParentSuiteNode: TestNode | undefined = suiteNodes[suiteNodes.length - 1];

    const testNodeSearchStartNode = testParentSuiteNode
      ? testFileNodeList[TestNodeType.Test].find(
          candidateStartNode => candidateStartNode.line > testParentSuiteNode!.line
        )
      : undefined;

    const testNode = findNode(TestNodeType.Test, testDescription, testNodeSearchStartNode, true);

    if (!testNode) {
      return undefined;
    }

    return { testNode, suiteNodes };
  }

  private addSuiteFileToCache(suite: string[], filePath: string) {
    let suiteKey = '';

    for (const suiteAncestor of suite) {
      suiteKey = suiteKey ? `${suiteKey} ${suiteAncestor}` : suiteAncestor;

      if (!this.specFilesBySuite.has(suiteKey)) {
        this.specFilesBySuite.set(suiteKey, []);
      }
      const suiteFiles = this.specFilesBySuite.get(suiteKey)!;
      if (!suiteFiles.includes(filePath)) {
        this.logger.debug(() => `Adding suite file to cache: ${filePath}`);
        this.logger.trace(() => `Suite for cached file is: ${suiteKey}`);

        suiteFiles.push(filePath);
      }
    }
  }

  private getSuiteFilesFromCache(suite: string[]): string[] | undefined {
    let suiteKey = '';

    for (const suiteAncestor of suite) {
      suiteKey = suiteKey ? `${suiteKey} ${suiteAncestor}` : suiteAncestor;
      const suiteFiles = this.specFilesBySuite.get(suiteKey);

      if (suiteFiles) {
        return suiteFiles;
      }
    }
    return undefined;
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
