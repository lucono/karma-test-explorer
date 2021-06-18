import { readFileSync } from "fs";
import { resolve } from 'path';
import { Disposable } from "../api/disposable";
import { Logger } from "../core/logger";
import * as glob from "glob";

enum TestNodeType {
  Describe = "describe",
  It = "it"
};

interface TestSuiteFileInfo {
  // descriptions: { [key in TestNodeType]: string[] },
  // lineNumbers: { [key in TestNodeType]: (number | undefined)[] }
  descriptions: Record<TestNodeType, string[]>,
  lineNumbers: Record<TestNodeType, (number | undefined)[]>
}

export interface SpecLocation {
  file: string,
  line: number
}

export interface SpecFileInfo {
  suiteName: string,
  specCount: number
}

export interface SpecLocatorOptions extends Partial<glob.IOptions> {
  cwd?: string,
  ignore?: string[],
  fileEncoding?: string
}

// TODO: Use enum and a new vscode setting to allow selection of
// underlying test framework, such as Jasmine or Mocha or Jest etc,
// which will change the describe/it regex being used and tailor
// it to the suite and spec keywords of the selected framework.
const DEFAULT_FRAMEWORK_SPEC_REGEX: RegExp = /((^|\n)(\d+)\.)?\s+[xf]?(describe|it)\s*\(\s*((?<![\\])[\`\'\"])((?:.(?!(?<![\\])\5))*.?)\5/gis;
const DEFAULT_FILE_ENCODING = "utf-8";

export class SpecLocator implements Disposable {
  private readonly fileInfoMap: Map<string, TestSuiteFileInfo> = new Map();
  private readonly specFilesBySuite: Map<string, string[]> = new Map();
  private readonly cwd: string;

  public constructor(
    private readonly filePatterns: string[],
    private readonly logger: Logger,
    private readonly specLocatorOptions: SpecLocatorOptions = {})
  {
    this.cwd = specLocatorOptions.cwd ?? process.cwd();
    const fileEncoding = specLocatorOptions.fileEncoding ?? DEFAULT_FILE_ENCODING;
    let loadedFileCount: number = 0;

    this.getAbsoluteFilesForGlobs(filePatterns).forEach(filePath => {
      this.processFile(filePath, fileEncoding);
      loadedFileCount++;
    });

    this.logger.info(`Spec locator loaded ${loadedFileCount} spec files`);
  }

  private getAbsoluteFilesForGlobs(fileGlobs: string[]): string[] {
    return fileGlobs
      .map(patternString => glob.sync(patternString, this.specLocatorOptions))
      .reduce((consolidatedPaths = [], morePaths) => [...consolidatedPaths, ...morePaths])
      .map(filePath => resolve(this.cwd, filePath))
  }

  private processFile(fileAbsolutePath: string, fileEncoding?: string) {
    const fileTestInfo = this.parseTestSuiteFile(fileAbsolutePath, fileEncoding);
    this.fileInfoMap.set(fileAbsolutePath, fileTestInfo);

    if (fileTestInfo.descriptions.describe.length === 0) {
      return;
    }
    const fileTopSuite = [ fileTestInfo.descriptions.describe[0] ];
    this.addSuiteFileToCache(fileTopSuite, fileAbsolutePath);
  }

  public getSpecLocation(specSuite: string[], specDescription?: string): SpecLocation[] {
    if (specSuite.length === 0) {
      return [];
    }
    const specFiles = this.getSuiteFilesFromCache(specSuite);

    if (specFiles) {
      const specLocations: SpecLocation[] = specFiles.map((specFile: string): SpecLocation | undefined => {
          const specLine = this.getSpecLineNumber(this.fileInfoMap.get(specFile), specSuite, specDescription);
          return specLine ? { file: specFile, line: specLine } : undefined;
      }).filter(specLocation => specLocation !== undefined) as SpecLocation[];

      return specLocations;
    }

    const specLocations: SpecLocation[] = [];
    
    for (const specFile of this.fileInfoMap.keys()) {
      const specLineNumber = this.getSpecLineNumber(this.fileInfoMap.get(specFile), specSuite, specDescription);

      if (specLineNumber !== undefined) {
        this.addSuiteFileToCache(specSuite, specFile);
        specLocations.push({ file: specFile, line: specLineNumber });
      }
    }
    return specLocations;
  }

  public isSpecFile(filePath: string): boolean {  // FIXME: Not currently used?
    const fileAbsolutePath = resolve(this.cwd, filePath);
    const specFileAbsolutePaths = this.getAbsoluteFilesForGlobs(this.filePatterns);
    return specFileAbsolutePaths.includes(fileAbsolutePath);
  }

  // public getSpecFileInfo(filePath: string): SpecFileInfo | undefined {
  //   const fileAbsolutePath = path.resolve(this.cwd, filePath);
  //   const fileInfo = this.fileInfoMap.get(fileAbsolutePath);

  //   const specFileInfo = !fileInfo ? undefined : {
  //       suiteName: fileInfo.descriptions.describe[0],
  //       specCount: fileInfo.descriptions.it.length
  //     };

  //   return specFileInfo;
  // }

  // private lookupFileBySuite(topSuiteName: string): string[] {
  //   return this.specFilesByTopLevelSuite.get(topSuiteName) ?? [];
  // }

  // private registerFileBySuite(topSuiteName: string, fileAbsolutePath: string): void {
  //   if (this.specFilesByTopLevelSuite.has(topSuiteName)) {
  //     this.specFilesByTopLevelSuite.get(topSuiteName)!.push(fileAbsolutePath);
  //   } else {
  //     this.specFilesByTopLevelSuite.set(topSuiteName, [ fileAbsolutePath ]);
  //   }
  // }

  private addSuiteFileToCache(suite: string[], filePath: string) {
    let suiteKey = "";

    for (const suiteAncestor of suite) {
      suiteKey = suiteKey ? `${suiteKey} ${suiteAncestor}` : suiteAncestor;

      if (!this.specFilesBySuite.has(suiteKey)) {
        this.specFilesBySuite.set(suiteKey, []);
      }
      const suiteFiles = this.specFilesBySuite.get(suiteKey)!;
      if (!suiteFiles.includes(filePath)) {
        suiteFiles.push(filePath);
      }
    }
  }

  private getSuiteFilesFromCache(suite: string[]): string[] | undefined {
    let suiteKey = "";

    for (const suiteAncestor of suite) {
      suiteKey = suiteKey ? `${suiteKey} ${suiteAncestor}` : suiteAncestor;
      const suiteFiles = this.specFilesBySuite.get(suiteKey);

      if (suiteFiles) {
        return suiteFiles;
      }
    }
    return undefined;
  }

  private getSpecLineNumber(
    suiteFileInfo: TestSuiteFileInfo | undefined, 
    specSuite: string[] | undefined, 
    specDescription?: string | undefined
  ): number | undefined {

    if (!suiteFileInfo || !specSuite) {
      return undefined;
    }
    
    const findSpecIndex = (specType: TestNodeType, description: string, startIndex: number): number => {
      const specDescriptions = suiteFileInfo.descriptions[specType];      
      let searchIndex = startIndex;

      while (searchIndex < specDescriptions.length) {
        if (specDescriptions[searchIndex] === description) {
          return searchIndex;
        }
        searchIndex++;
      }
      return -1;
    };

    const describeSpecsToFind = specSuite ?? [];
    let describeSearchStartIndex = 0;
    let lastDescribeFoundIndex = -1;

    for (const describeSpec of describeSpecsToFind) {
      lastDescribeFoundIndex = findSpecIndex(TestNodeType.Describe, describeSpec, describeSearchStartIndex);

      if (lastDescribeFoundIndex < 0) {
        break;
      }
      describeSearchStartIndex = (lastDescribeFoundIndex + 1);
    }
    
    if (lastDescribeFoundIndex < 0) {
      return undefined;
    }

    const lastDescribeFoundLineNumber = suiteFileInfo.lineNumbers[TestNodeType.Describe][lastDescribeFoundIndex];

    if (lastDescribeFoundLineNumber === undefined) {
      return undefined;
    }

    if (specDescription === undefined) {
      return lastDescribeFoundLineNumber;
    }

    const itSearchStartIndex = suiteFileInfo.lineNumbers[TestNodeType.It]
      .map((itLineNumber, itIndex) => ({ line: itLineNumber, index: itIndex }))
      .find(item => (item.line !== undefined) && item.line > lastDescribeFoundLineNumber)
      ?.index;

    if (itSearchStartIndex === undefined) {
      return undefined;
    }

    const itSpecFoundIndex = findSpecIndex(TestNodeType.It, specDescription, itSearchStartIndex);
    
    if (itSpecFoundIndex < 0) {
      return undefined;
    }

    const itSpecFoundLineNumber = suiteFileInfo.lineNumbers[TestNodeType.It][itSpecFoundIndex];

    return itSpecFoundLineNumber;
  }

  private getTestFileData(path: string, encoding?: string): string {
    const fileText = this.readFile(path, encoding)
      .split('\n')
      .map((lineText, lineNumber) => `${lineNumber}. ${lineText}`)
      .join('\n');

    return this.removeComments(fileText);
  }

  private readFile(path: string, encoding?: string): string {
    return readFileSync(path, encoding || DEFAULT_FILE_ENCODING);
  }

  private parseTestSuiteFile(filePath: string, encoding?: string): TestSuiteFileInfo {
    const data = this.getTestFileData(filePath, encoding);
    const fileInfo: TestSuiteFileInfo = {
      descriptions: { [TestNodeType.Describe]: [], [TestNodeType.It]: [] },
      lineNumbers: { [TestNodeType.Describe]: [], [TestNodeType.It]: [] }
    };

    let matchResult: RegExpExecArray | null;
    let activeLineNumber: number | undefined;

    while ((matchResult = DEFAULT_FRAMEWORK_SPEC_REGEX.exec(data)) != null) {
      activeLineNumber = matchResult[3] !== undefined ? Number(matchResult[3]) : activeLineNumber;
      const testType = matchResult[4] as TestNodeType;
      const testDescription = matchResult[6]?.replace(/\\(['"`])/g, "$1");

      if (!testType || !testDescription) {
        continue;
      }
      fileInfo.descriptions[testType].push(testDescription);
      fileInfo.lineNumbers[testType].push(activeLineNumber);
    }
    return fileInfo;
  }

  private removeComments(data: string): string {
    return data.replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, "");
  }

  public dispose() {
    this.logger.dispose();
  }
}
