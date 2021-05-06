import { readFileSync } from "fs";
import * as glob from "glob";
import * as path from 'path';

enum TestNodeType {
  Describe = "describe",
  It = "it"
};

interface TestSuiteFileInfo {
  descriptions: { [key in TestNodeType]: string[] },
  lineNumbers: { [key in TestNodeType]: (number | undefined)[] }
}

export interface SpecLocation {
  file: string,
  line: number
}

export interface SpecFileInfo {
  suiteName: string,
  specCount: number
}

export interface PathFinderOptions {
  cwd?: string,
  ignore?: string[]
}

// TODO: Use enum and a new vscode setting to allow selection of
// underlying test framework, such as Jasmine or Mocha or Jest etc,
// which will change the describe/it regex being used and tailor
// it to the suite and spec keywords of the selected framework.
const DEFAULT_FRAMEWORK_SPEC_REGEX: RegExp = /((^|\n)(\d+)\.)?\s+[xf]?(describe|it)\s*\(\s*((?<![\\])[\`\'\"])((?:.(?!(?<![\\])\5))*.?)\5/gis;
const DEFAULT_FILE_ENCODING = "utf-8";

export class PathFinder {
  private readonly fileInfoMap: Map<string, TestSuiteFileInfo> = new Map();
  private readonly suiteFilesCache: Map<string, string> = new Map();
  private readonly cwd: string;

  public constructor(filePatterns: string[], options?: PathFinderOptions, fileEncoding?: string) {
    this.cwd = options?.cwd ?? process.cwd();

    filePatterns
      .map(patternString => glob.sync(patternString, options))
      .reduce((consolidatedPaths = [], morePaths) => [...consolidatedPaths, ...morePaths])
      .forEach(filePath => {
        const fileAbsolutePath = path.resolve(this.cwd, filePath);
        const fileTestInfo = this.parseTestSuiteFile(fileAbsolutePath, fileEncoding);
        this.fileInfoMap.set(fileAbsolutePath, fileTestInfo);
      });
  }

  public getSpecLocation(specSuite: string[], specDescription?: string): SpecLocation | undefined {
    let specFile = this.getSuiteFromCache(specSuite);

    if (specFile) {
      const specLine = this.getSpecLineNumber(this.fileInfoMap.get(specFile), specSuite, specDescription);
      if (specLine !== undefined) {
        return { file: specFile, line: specLine };
      }
    }

    for (specFile of this.fileInfoMap.keys()) {
      const specLineNumber = this.getSpecLineNumber(this.fileInfoMap.get(specFile), specSuite, specDescription);

      if (specLineNumber !== undefined) {
        this.addSuiteToCache(specSuite, specFile);
        return { file: specFile, line: specLineNumber };
      }
    }
    return undefined;
  }

  public isSpecFile(filePath: string): boolean {
    const fileAbsolutePath = path.resolve(this.cwd, filePath);
    return this.fileInfoMap.hasOwnProperty(fileAbsolutePath);
  }

  public getSpecFileInfo(filePath: string): SpecFileInfo | undefined {
    const fileAbsolutePath = path.resolve(this.cwd, filePath);
    const fileInfo = this.fileInfoMap.get(fileAbsolutePath);

    const specFileInfo = !fileInfo ? undefined : {
        suiteName: fileInfo.descriptions.describe[0],
        specCount: fileInfo.descriptions.it.length
      };

    return specFileInfo;
  }

  private getSuiteFromCache(suite: string[]): string | undefined {
    let suiteKey = "";

    for (const suiteAncestor of suite) {
      suiteKey = suiteKey ? `${suiteKey} ${suiteAncestor}` : suiteAncestor;
      const suiteFile = this.suiteFilesCache.get(suiteKey);
      if (suiteFile !== undefined) {
        return suiteFile;
      }
    }
    return undefined;
  }

  private addSuiteToCache(suite: string[], filePath: string) {
    let suiteKey = "";

    for (const suiteAncestor of suite) {
      suiteKey = suiteKey ? `${suiteKey} ${suiteAncestor}` : suiteAncestor;
      if (!this.suiteFilesCache.has(suiteKey)) {
        this.suiteFilesCache.set(suiteKey, filePath);
      }
    }
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
}
