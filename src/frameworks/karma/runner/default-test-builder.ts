import { TestInfo, TestSuiteInfo } from 'vscode-test-adapter-api';
import { EXTENSION_CONFIG_PREFIX, EXTENSION_NAME } from '../../../constants';
import { TestDefinition, TestDefinitionState } from '../../../core/base/test-definition';
import { TestType } from '../../../core/base/test-infos';
import { ConfigSetting } from '../../../core/config/config-setting';
import { TestHelper } from '../../../core/test-helper';
import { TestDefinitionInfo, TestLocator } from '../../../core/test-locator';
import { TestActiveState } from '../../../types/vscode-test-adapter-api';
import { Logger } from '../../../util/logging/logger';
import { SpecCompleteResponse } from './spec-complete-response';
import { TestBuilder } from './test-builder';

interface TestsFocusContext {
  currentFocusedSuites: Set<TestInfo | TestSuiteInfo>;
  previousFocusedSuites: Set<TestInfo | TestSuiteInfo>;
}

export interface DefaultTestBuilderOptions {
  excludeDisabledTests?: boolean;
  showOnlyFocusedTests?: boolean;
  showUnmappedTests?: boolean;
}

const DEFAULT_OPTIONS: Required<DefaultTestBuilderOptions> = {
  excludeDisabledTests: false,
  showOnlyFocusedTests: false,
  showUnmappedTests: true
};

export class DefaultTestBuilder implements TestBuilder {
  private readonly options: Required<DefaultTestBuilderOptions>;

  public constructor(
    private readonly testLocator: TestLocator,
    private readonly testHelper: TestHelper,
    private readonly logger: Logger,
    options: DefaultTestBuilderOptions = {}
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  public buildTests(specs: SpecCompleteResponse[]): (TestInfo | TestSuiteInfo)[] {
    const rootContainerSuite = this.createRootContainerSuite();
    const focusContext: TestsFocusContext = { currentFocusedSuites: new Set(), previousFocusedSuites: new Set() };
    const singleDefinitionTestsByNormalizedId: Map<string, TestInfo | undefined> = new Map();
    const unreferencedDuplicateTestDefinitionResultsByNormalizedId: Map<string, TestDefinitionInfo[]> = new Map();

    let processedSpecCount = 0;

    specs.forEach(rawSpec => {
      const spec: SpecCompleteResponse = { ...rawSpec, suite: this.filterSuiteNoise(rawSpec.suite) };
      const normalizedSpecId = this.getNormalizedSpecId(spec);
      const matchingTestDefinitionResults = this.testLocator.getTestDefinitions(spec.suite, spec.description);

      this.logger.trace(
        () =>
          `Got ${matchingTestDefinitionResults.length} matching test definitions: ` +
          `'${JSON.stringify(matchingTestDefinitionResults)}' ` +
          `for test location lookup of spec: ${JSON.stringify(spec, null, 2)}`
      );

      let selectedTestDefinitionResult: TestDefinitionInfo | undefined;

      if (matchingTestDefinitionResults.length === 1) {
        selectedTestDefinitionResult = matchingTestDefinitionResults[0];
      } else if (matchingTestDefinitionResults.length > 1) {
        if (!unreferencedDuplicateTestDefinitionResultsByNormalizedId.has(normalizedSpecId)) {
          unreferencedDuplicateTestDefinitionResultsByNormalizedId.set(normalizedSpecId, [
            ...matchingTestDefinitionResults
          ]);
        }
        const unreferencedMatchingTestDefinitionResults =
          unreferencedDuplicateTestDefinitionResultsByNormalizedId.get(normalizedSpecId)!;

        if (unreferencedMatchingTestDefinitionResults.length > 0) {
          selectedTestDefinitionResult = unreferencedMatchingTestDefinitionResults[0];
          unreferencedMatchingTestDefinitionResults.splice(0, 1);
        }
      }

      this.logger.trace(
        () =>
          `Selected test definition: '${JSON.stringify(selectedTestDefinitionResult)}' ` +
          `for spec: ${JSON.stringify(spec, null, 2)}`
      );

      const matchingTestDefinitions = matchingTestDefinitionResults.map(
        testDefinitionResult => testDefinitionResult.test
      );
      const testDefinition = selectedTestDefinitionResult?.test;
      const suiteDefinitions = selectedTestDefinitionResult?.suite;

      const test = this.buildTest(
        rootContainerSuite,
        spec,
        suiteDefinitions ?? spec.suite,
        testDefinition,
        focusContext
      );
      const isUnconflictedSpec = matchingTestDefinitionResults.length === 1;

      const existingDuplicateTest = isUnconflictedSpec
        ? singleDefinitionTestsByNormalizedId.get(normalizedSpecId)
        : undefined;

      let loadProblemMessage: string | undefined;
      let errored = false;

      if (isUnconflictedSpec) {
        if (existingDuplicateTest) {
          loadProblemMessage =
            `"${spec.fullName}" \n\n` +
            `--- \n\n` +
            `Duplicate instances of the above test were reported in your project ` +
            `by Karma which could lead to incorrect and misreported test results. ` +
            (test?.file
              ? `${EXTENSION_NAME} has only mapped one matching test defined in ` +
                `your project at the location below. \n\n` +
                test.file
              : '');

          errored = true;
          existingDuplicateTest.message = loadProblemMessage;
          existingDuplicateTest.errored = errored;
        }
        singleDefinitionTestsByNormalizedId.set(normalizedSpecId, test);
      } else if (matchingTestDefinitions.length === 0) {
        loadProblemMessage =
          `"${spec.fullName}" \n\n` +
          `--- \n\n` +
          `${EXTENSION_NAME} could not find the test source for the above test ` +
          `within your project. This can occur if the test uses parameterization ` +
          `or a computed test description, or if the file in which this test is ` +
          `defined is not captured by the glob pattern specified by your ` +
          `'${EXTENSION_CONFIG_PREFIX}.${ConfigSetting.TestFiles}' setting.`;
      } else if (matchingTestDefinitions.length > 1) {
        errored = true;
        let duplicateSpecCounter = 0;

        const duplicateSpecFiles = matchingTestDefinitions
          .sort((loc1, loc2) => (loc1.file === testDefinition?.file ? -1 : loc2.file === testDefinition?.file ? 1 : 0))
          .map(location => `${++duplicateSpecCounter}. ${location.file}:${location.line + 1}`)
          .join('\n');

        loadProblemMessage =
          `"${spec.fullName}" \n\n` +
          `--- \n\n` +
          `${EXTENSION_NAME} found duplicate matching definitions for the ` +
          `above test in your project at the locations below. This could ` +
          `lead to incorrect and misreported test results. \n\n` +
          `${duplicateSpecFiles}`;
      }

      if (test && loadProblemMessage) {
        test.message = loadProblemMessage;
        test.errored = errored;
      }
      processedSpecCount += 1;
    });
    this.logger.debug(() => `Processed ${processedSpecCount} specs to build tests`);

    this.updateFocusedStates(focusContext);
    const builtTests = rootContainerSuite.children;

    return builtTests;
  }

  private buildTest(
    rootContainer: TestSuiteInfo,
    spec: SpecCompleteResponse,
    suiteChain: (TestDefinition | string)[],
    testDefinition: TestDefinition | undefined,
    focusContext: TestsFocusContext
  ): TestInfo | undefined {
    // --- Handle unmapped tests and corresponding filter option ---

    if (!testDefinition) {
      this.logger.debug(() => `Undetermine test definition location for spec Id: ${spec.id}`);
      this.logger.trace(() => `Spec with undetermined test defintion location: ${JSON.stringify(spec)}`);

      if (!this.options.showUnmappedTests) {
        this.logger.debug(
          () =>
            `'${ConfigSetting.ShowUnmappedTests}' setting is false - ` +
            `Skipping spec with undetermined source file and spec Id: ${spec.id}`
        );
        return undefined;
      }
    }

    // --- Handle disabled tests and corresponding filter option ---

    if (this.options.excludeDisabledTests && testDefinition?.disabled === true) {
      this.logger.debug(
        () =>
          `'${ConfigSetting.ExcludeDisabledTests}' setting is true - ` +
          `Skipping disabled test with spec Id: ${spec.id}`
      );
      return undefined;
    }

    // --- Handle preliminary known unfocusable tests and corresponding filter option ---

    const hasAtLeastOneFocusableTestSuite = suiteChain.some(
      suiteItem => typeof suiteItem === 'string' || suiteItem.state === TestDefinitionState.Focused
    );

    const testIsFocusable =
      testDefinition === undefined ||
      testDefinition.state === TestDefinitionState.Focused ||
      (testDefinition.disabled === false && hasAtLeastOneFocusableTestSuite);

    if (this.options.showOnlyFocusedTests && !testIsFocusable) {
      this.logger.debug(
        () =>
          `'${ConfigSetting.ShowOnlyFocusedTests}' setting is true - ` +
          `Skipping unfocusable test with spec Id: ${spec.id}`
      );
      return undefined;
    }

    // --- Build test and filter resulting unfocused tests ---

    const ancestorSuites: [TestSuiteInfo, TestDefinition | undefined][] = [];
    const currentSuiteChain: string[] = [];

    let detachNode: (() => void) | undefined;
    let currentSuiteNode: TestSuiteInfo = rootContainer;

    for (const suiteItem of suiteChain) {
      const suiteDefinition = typeof suiteItem === 'string' ? undefined : suiteItem;
      const suiteName = typeof suiteItem === 'string' ? suiteItem : suiteItem.description;
      const suiteFile = suiteDefinition?.file;
      const suiteLine = suiteDefinition?.line;

      currentSuiteChain.push(suiteName);

      let nextSuiteNode: TestSuiteInfo | undefined;

      const currentNodeIsDesiredNode =
        currentSuiteNode !== rootContainer &&
        currentSuiteNode.name === suiteName &&
        currentSuiteNode.file === suiteFile &&
        currentSuiteNode.line === suiteLine;

      if (currentNodeIsDesiredNode) {
        nextSuiteNode = currentSuiteNode;
      } else {
        nextSuiteNode = currentSuiteNode.children.find(
          candidateNode =>
            candidateNode.type === TestType.Suite &&
            candidateNode.name === suiteName &&
            candidateNode.file === suiteFile &&
            candidateNode.line === suiteLine
        ) as TestSuiteInfo | undefined;
      }

      if (!nextSuiteNode) {
        nextSuiteNode = this.createSuite(currentSuiteChain, suiteDefinition);
        currentSuiteNode.children.push(nextSuiteNode);

        const capturedAttachedNode = nextSuiteNode;
        const capturedAttachedNodeParent = currentSuiteNode;

        detachNode ??= () => {
          const attachedNodeIndex = capturedAttachedNodeParent.children.indexOf(capturedAttachedNode);
          if (attachedNodeIndex > -1) {
            capturedAttachedNodeParent.children.splice(attachedNodeIndex, 1);
          }
        };
      }

      ancestorSuites.push([nextSuiteNode, suiteDefinition]);
      currentSuiteNode = nextSuiteNode;
    }

    const test = this.buildFocusFilteredTest(spec, testDefinition, ancestorSuites, focusContext);

    if (test) {
      this.logger.debug(() => `Focus filter criteria includes test id: ${spec.id}`);
      currentSuiteNode.children.push(test);
    } else {
      this.logger.debug(() => `Focus filter criteria excludes test id: ${spec.id}`);
      detachNode?.();
    }

    return test;
  }

  private buildFocusFilteredTest(
    spec: SpecCompleteResponse,
    testDefinition: TestDefinition | undefined,
    ancestorSuitePairs: [TestSuiteInfo, TestDefinition | undefined][],
    focusContext: TestsFocusContext
  ): TestInfo | undefined {
    const test: TestInfo | undefined = this.createTest(spec, testDefinition);
    const ancestorSuites = ancestorSuitePairs.map(suiteDefinitionPair => suiteDefinitionPair[0]);
    const focusedAncestorNodes: TestSuiteInfo[] = [];

    ancestorSuitePairs.forEach(suiteDefinitionPair => {
      if (suiteDefinitionPair[1]?.state === TestDefinitionState.Focused) {
        focusedAncestorNodes.push(suiteDefinitionPair[0]);
      }
    });

    const unfocusedAncestorNodes: TestSuiteInfo[] = [...focusedAncestorNodes];
    const tailFocusedNode = testDefinition?.state === TestDefinitionState.Focused ? test : unfocusedAncestorNodes.pop();
    const testIsFocused = tailFocusedNode && !focusContext.previousFocusedSuites.has(tailFocusedNode);

    if (testIsFocused) {
      focusContext.currentFocusedSuites.add(tailFocusedNode);

      const firstNewlyUnfocusedNode = unfocusedAncestorNodes.find(focusedAncestorNode => {
        const isPreviouslyFocusedNode = focusContext.previousFocusedSuites.has(focusedAncestorNode);
        return !isPreviouslyFocusedNode;
      });

      if (firstNewlyUnfocusedNode) {
        unfocusedAncestorNodes
          .slice(unfocusedAncestorNodes.indexOf(firstNewlyUnfocusedNode))
          .forEach(newlyUnfocusedNode => {
            focusContext.currentFocusedSuites.delete(newlyUnfocusedNode);
            focusContext.previousFocusedSuites.add(newlyUnfocusedNode);
          });

        if (this.options.showOnlyFocusedTests) {
          let testTrimCurrentNodeIndex = ancestorSuites.indexOf(firstNewlyUnfocusedNode);

          if (testTrimCurrentNodeIndex > -1) {
            const testTrimLastNodeIndex = ancestorSuites.length - 1;

            while (testTrimCurrentNodeIndex < ancestorSuites.length) {
              const ancestorNodeToTrim = ancestorSuites[testTrimCurrentNodeIndex];

              const ancestorSingleChildNode =
                testTrimCurrentNodeIndex === testTrimLastNodeIndex
                  ? test
                  : ancestorSuites[testTrimCurrentNodeIndex + 1];

              ancestorNodeToTrim.children = ancestorNodeToTrim.children.includes(ancestorSingleChildNode)
                ? [ancestorSingleChildNode]
                : [];

              testTrimCurrentNodeIndex++;
            }
          } else {
            this.logger.warn(() => `Encountered unexpected situation where unfocused test was not found in test list`);
          }
        }
      }
    } else if (this.options.showOnlyFocusedTests) {
      this.logger.debug(() => `Not building test attached to unfocused node: ${test.fullName}`);
      return undefined;
    }

    return test;
  }

  private updateFocusedStates(focusContext: TestsFocusContext) {
    const addFocus = (node: TestInfo | TestSuiteInfo) => {
      if (node.activeState !== 'default' && node.activeState !== 'focused') {
        return;
      }

      if (node.activeState === 'default') {
        const updatedState: TestActiveState = 'focusedIn';
        node.activeState = updatedState;
        node.label = this.testHelper.getTestLabel(node.name, TestDefinitionState.Default, updatedState);
        node.tooltip = this.testHelper.getTestTooltip(node.fullName, updatedState);
      }

      if (node.type === TestType.Suite) {
        node.children.forEach(childSuiteOrTest => addFocus(childSuiteOrTest));
      }
    };
    focusContext.currentFocusedSuites.forEach(focusedSuite => addFocus(focusedSuite));
  }

  private createRootContainerSuite(): TestSuiteInfo {
    const containerSuite: TestSuiteInfo = {
      type: TestType.Suite,
      id: ':',
      label: 'Karma tests',
      name: '',
      fullName: '',
      children: [],
      testCount: 0,
      activeState: 'default'
    };
    return containerSuite;
  }

  private createSuite(suitePath: string[], suiteDefinition?: TestDefinition): TestSuiteInfo {
    const suiteName = suitePath[suitePath.length - 1];
    const suiteFullName = suitePath.join(' ');
    const suiteId = this.getNormalizedSuiteId(suitePath, suiteDefinition?.file);
    const suiteActiveState = this.testHelper.getTestActiveState(suiteDefinition);
    const suiteLabel = this.testHelper.getTestLabel(suiteName, suiteDefinition, suiteActiveState);
    const tooltip = this.testHelper.getTestTooltip(suiteFullName, suiteActiveState);

    const suiteNode: TestSuiteInfo = {
      type: TestType.Suite,
      id: suiteId,
      activeState: suiteActiveState,
      label: suiteLabel,
      name: suiteName,
      fullName: suiteFullName,
      tooltip,
      testCount: 0,
      file: suiteDefinition?.file,
      line: suiteDefinition?.line,
      children: []
    };
    return suiteNode;
  }

  private createTest(spec: SpecCompleteResponse, testDefinition?: TestDefinition): TestInfo {
    const testName = spec.description;
    const testActiveState = this.testHelper.getTestActiveState(testDefinition);
    const testLabel = this.testHelper.getTestLabel(testName, testDefinition, testActiveState);
    const tooltip = this.testHelper.getTestTooltip(spec.fullName, testActiveState);

    const test: TestInfo = {
      type: TestType.Test,
      id: spec.id,
      label: testLabel,
      activeState: testActiveState,
      name: testName,
      fullName: spec.fullName,
      tooltip,
      file: testDefinition?.file,
      line: testDefinition?.line
    };
    return test;
  }

  private getNormalizedSpecId(spec: SpecCompleteResponse): string {
    const suiteId = this.getNormalizedSuiteId(spec.suite);
    return `${suiteId}==>${spec.description}`;
  }

  private getNormalizedSuiteId(specSuite: string[], specFile?: string): string {
    const suiteComponent = specSuite.map(suiteName => `[${suiteName}]`).join('-->');
    return `${specFile ?? ''}:${suiteComponent}`;
  }

  private filterSuiteNoise(suite: string[]) {
    return suite.length > 0 && 'Jasmine__TopLevel__Suite' === suite[0] ? suite.slice(1) : suite;
  }
}
