import { TestInfo, TestSuiteInfo } from 'vscode-test-adapter-api';
import { TestType } from '../../../core/base/test-infos';
import { SpecLocator } from '../../../core/spec-locator';
import { Logger } from '../../../util/logging/logger';
import { SpecCompleteResponse } from './spec-complete-response';

export class SpecResponseToTestSuiteInfoMapper {
  public constructor(private readonly specLocator: SpecLocator, private readonly logger: Logger) {}

  public map(specs: SpecCompleteResponse[]): TestSuiteInfo {
    const rootTestSuite: TestSuiteInfo = this.createRootSuite();
    const unreferencedDuplicateSpecFilesBySpec: Map<string, string[]> = new Map();

    let processedSpecCount = 0;

    specs.forEach(rawSpec => {
      const spec: SpecCompleteResponse = { ...rawSpec, suite: this.filterSuiteNoise(rawSpec.suite) };
      const matchingSpecLocations = this.specLocator.getSpecLocation(spec.suite, spec.description);
      let specFile: string | undefined = spec.filePath;

      if (matchingSpecLocations.length === 1) {
        specFile = specFile ?? matchingSpecLocations[0].file;
      } else if (matchingSpecLocations.length > 1) {
        if (!unreferencedDuplicateSpecFilesBySpec.has(spec.fullName)) {
          unreferencedDuplicateSpecFilesBySpec.set(
            spec.fullName,
            matchingSpecLocations.map(loc => loc.file)
          );
        }
        const unreferenceMatchingSpecFiles = unreferencedDuplicateSpecFilesBySpec.get(spec.fullName)!;
        specFile = specFile ?? unreferenceMatchingSpecFiles[0];

        if (unreferenceMatchingSpecFiles.includes(specFile)) {
          unreferenceMatchingSpecFiles.splice(unreferenceMatchingSpecFiles.indexOf(specFile), 1);
        }
      }

      if (!specFile) {
        this.logger.debug(() => `Skipped spec with undetermined source file - spec Id: ${spec.id}`);
        this.logger.trace(() => `Spec with undetermined source file: ${JSON.stringify(spec)}`);
        return;
      }
      const testSuite = this.getDescendantSuite(rootTestSuite, spec.suite, specFile);
      const test = this.createTest(spec, specFile);
      testSuite.children.push(test);
      processedSpecCount += 1;
    });

    this.logger.debug(() => `Mapped ${processedSpecCount} tests from specs`);
    return rootTestSuite;
  }

  private createRootSuite(): TestSuiteInfo {
    const rootSuite: TestSuiteInfo = {
      type: TestType.Suite,
      id: ':',
      label: 'Karma tests',
      fullName: '', // To prevent being runnable with grep pattern of fullName
      children: [],
      testCount: 0
    };
    return rootSuite;
  }

  private getDescendantSuite(baseNode: TestSuiteInfo, suitePath: string[], specFile: string): TestSuiteInfo {
    const currentSuitePath: string[] = [];
    let currentNode: TestSuiteInfo = baseNode;

    for (const suiteName of suitePath) {
      currentSuitePath.push(suiteName);

      let nextNode =
        currentNode.label === suiteName && currentNode.file === specFile
          ? currentNode
          : (currentNode.children.find(child => {
              return child.type === TestType.Suite && child.label === suiteName && child.file === specFile;
            }) as TestSuiteInfo | undefined);

      if (!nextNode) {
        nextNode = this.createSuite(currentSuitePath, specFile);
        currentNode.children.push(nextNode);
      }
      currentNode = nextNode;
    }
    return currentNode;
  }

  private createSuite(suitePath: string[], suiteFile: string): TestSuiteInfo {
    const allMatchingSuiteLocations = this.specLocator.getSpecLocation(suitePath);
    const suiteLocation = allMatchingSuiteLocations.find(loc => loc.file === suiteFile);
    const suiteName = suitePath[suitePath.length - 1];
    const suiteFullName = suitePath.join(' ');
    const suiteId = `${suiteFile}:${suiteFullName}`;

    const hasDuplicates = allMatchingSuiteLocations.length > 1;
    let message: string | undefined;

    if (hasDuplicates) {
      let duplicateSuiteCounter = 0;

      const duplicateSuiteFiles = allMatchingSuiteLocations
        .sort((loc1, loc2) => (loc1.file === suiteFile ? -1 : loc2.file === suiteFile ? 1 : 0))
        .map(location => `${++duplicateSuiteCounter}. ${location.file}:${location.line + 1}`)
        .join('\n');

      message =
        `"${suiteFullName}" \n\n` +
        '---------- \n\n' +
        'The above test suite has duplicate definitions in the following files ' +
        'in your project which could lead to conflicting test results: \n\n' +
        `${duplicateSuiteFiles}`;
    }

    const suiteNode: TestSuiteInfo = {
      type: TestType.Suite,
      id: suiteId,
      fullName: suiteFullName,
      label: suiteName,
      tooltip: suiteFullName,
      children: [],
      testCount: 0,
      file: suiteLocation?.file,
      line: suiteLocation?.line,
      message
    };
    return suiteNode;
  }

  private createTest(spec: SpecCompleteResponse, specFile: string): TestInfo {
    const allMatchingSpecLocations = this.specLocator.getSpecLocation(spec.suite, spec.description);
    const specLocation = allMatchingSpecLocations.find(loc => loc.file === specFile);

    const runFailureMessage = spec.failureMessages?.join('\n');
    let loadFailureMessage: string | undefined;

    let file = spec.filePath;
    let line = spec.line;
    let errored = false;

    if (!file || line === undefined) {
      file = specLocation?.file;
      line = specLocation?.line;
      const hasDuplicates = allMatchingSpecLocations.length > 1;

      if (hasDuplicates) {
        errored = true;
        let duplicateSpecCounter = 0;

        const duplicateSpecFiles = allMatchingSpecLocations
          .sort((loc1, loc2) => (loc1.file === specFile ? -1 : loc2.file === specFile ? 1 : 0))
          .map(location => `${++duplicateSpecCounter}. ${location.file}:${location.line + 1}`)
          .join('\n');

        loadFailureMessage =
          `"${spec.fullName}" \n\n` +
          '---------- \n\n' +
          'The above test has duplicate definitions in the following locations ' +
          'in your project which could lead to conflicting test results: \n\n' +
          `${duplicateSpecFiles}`;
      }
    }

    const test: TestInfo = {
      type: TestType.Test,
      id: spec.id,
      fullName: spec.fullName,
      label: spec.description,
      tooltip: spec.fullName,
      message: runFailureMessage || loadFailureMessage,
      file,
      line,
      errored
    };
    return test;
  }

  private filterSuiteNoise(suitePath: string[]) {
    if (suitePath.length > 0 && 'Jasmine__TopLevel__Suite' === suitePath[0]) {
      suitePath = suitePath.slice(1);
    }
    return suitePath;
  }
}
