import fs = require("fs");
import * as glob from "glob";
import { FilePattern } from 'karma';

enum TestNodeType {
  Describe = "describe",
  It = "it"
};

interface TestSuiteFileInfo {
  descriptions: { [key in TestNodeType]: string[] },
  lineNumbers: { [key in TestNodeType]: Array<number|undefined> }
}

interface TestSuiteFileInfoMap {
  [key: string]: TestSuiteFileInfo
}

export interface SpecLocation {
  file: string,
  line: number
}

export interface PathFinderOptions {
  cwd?: string,
  ignore?: string[]
}

const DEFAULT_FILE_ENCODING = "utf-8";

export class PathFinder {
  private readonly regexPattern: RegExp = /((^|\n)(\d+)\.)?\s+[xf]?(describe|it)\s*\(\s*([\`\'\"])((((?!\5).)|\\.)*?)\5/gis;
  private readonly fileInfoMap: TestSuiteFileInfoMap;

  public constructor(
    filePatterns: Array<string|FilePattern>, 
    options?: PathFinderOptions, 
    fileEncoding?: string
  ) {
    this.fileInfoMap = {};

    filePatterns.map(filePattern => (filePattern as FilePattern).pattern || filePattern as string)
      .map(patternString => glob.sync(patternString, options))
      .reduce((consolidatedPaths, morePaths) => [...consolidatedPaths, ...morePaths], [])
      .forEach(filePath => this.fileInfoMap[filePath] = this.parseTestFile(filePath, fileEncoding));
  }

  public getSpecLocation(specSuite: string[], specDescription?: string, specfile?: string): SpecLocation | undefined {
    for (const filePath of Object.keys(this.fileInfoMap)) {
      const specLineNumber = this.getSpecLineNumber(this.fileInfoMap[filePath], specSuite, specDescription);

      if (specLineNumber !== undefined) {
        return { file: filePath, line: specLineNumber };
      }
    }
    return undefined;
  }

  private getSpecLineNumber(
    suiteFileInfo: TestSuiteFileInfo | undefined, 
    specSuite: string[] | undefined, 
    specDescription?: string | undefined
  ): number | undefined {

    if ((!specSuite && specDescription === undefined) || !suiteFileInfo) {
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

    const describeSpecsToFind = specSuite || [];
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
    return fs.readFileSync(path, encoding || DEFAULT_FILE_ENCODING);
  }

  private parseTestFile(filePath: string, encoding?: string): TestSuiteFileInfo {
    const data = this.getTestFileData(filePath, encoding);
    const fileInfo: TestSuiteFileInfo = {
      descriptions: { [TestNodeType.Describe]: [], [TestNodeType.It]: [] },
      lineNumbers: { [TestNodeType.Describe]: [], [TestNodeType.It]: [] }
    };

    let matchResult: RegExpExecArray | null;
    let currentLineNumber: number | undefined;

    while ((matchResult = this.regexPattern.exec(data)) != null) {
      currentLineNumber = matchResult[3] !== undefined ? Number(matchResult[3]) : currentLineNumber;
      const type = matchResult[4] as TestNodeType;
      const text = matchResult[6];

      if (!type || !text) {
        continue;
      }
      fileInfo.descriptions[type].push(text);
      fileInfo.lineNumbers[type].push(currentLineNumber);
    }
    return fileInfo;
  }

  private removeComments(data: string): string {
    return data.replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, "");
  }
}
