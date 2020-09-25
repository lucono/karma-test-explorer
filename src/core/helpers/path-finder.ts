import { FileHelper } from "./file-helper";
import * as glob from "glob";
import * as RegExpEscape from "escape-string-regexp";

export interface TestFilesStructureInfo {
  [key: string]: {
    describe: string[],
    it: string[]
  }
}

enum TestNodeType {
  Describe = "describe",
  It = "it"
};

export class PathFinder {
  private readonly regexPattern: RegExp = /((describe)|(it))\s*\(\s*((?<![\\])[\`\'\"])((?:.(?!(?<![\\])\4))*.?)\4/gi;
  //private readonly describeType = "describe";
  //private readonly itType = "it";
  public constructor(private readonly fileHelper: FileHelper) {}

  public getTestFilesPaths(pattern: string, encoding: string): TestFilesStructureInfo {
    const paths = {};
    const results = glob.sync(pattern);
    results.map((path) => {
      this.parseTestFile(paths, path, this.getTestFileData(path, encoding));
    });

    return paths;
  }

  public getSpecLine(suite: string[], spec: string, path: string, encoding: string): number | undefined {
    const fileText = this.fileHelper.readFile(path, encoding);

    if (!fileText) {
      return;
    }

    return this.findLineContaining(suite, spec, fileText);
  }
  public getTestFilePath(paths: TestFilesStructureInfo, describe: string, it: string) {
    const testFile = Object.keys(paths).find(path => this.exist(paths, path, describe, it));

    return testFile;
  }

  private getTestFileData(path: string, encoding: string): string {
    const fileText = this.fileHelper.readFile(path, encoding);

    return this.removeNewLines(this.removeComments(fileText));
  }

  private parseTestFile(paths: TestFilesStructureInfo, path: string, data: string) {
    let result: RegExpExecArray | null;
    while ((result = this.regexPattern.exec(data)) != null) {
      const type = (result[2] || result[3]) as TestNodeType;
      const text = result[5];

      if (paths[path] === undefined) {
        paths[path] = { describe: [], it: [] };
      }
      const fileEntry = paths[path];
      fileEntry[type].push(text);
    }
  }

  private exist(paths: TestFilesStructureInfo, path: string, describe: string, it: string) {
    const existsDescribe = paths[path].describe.some((element) => describe.startsWith(element));
    const existsIt = paths[path].it.some((element) => it.startsWith(element));

    return existsDescribe && existsIt;
  }

  private removeComments(data: string): string {
    return data.replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, "");
  }

  private removeNewLines(data: string): string {
    return data.replace(/\r?\n|\r/g, "");
  }

  private findLineContaining(predecessorLines: string[] | undefined, lineText: string | undefined, fileText: string | undefined): number | undefined {
    if ((!predecessorLines && !lineText) || !fileText) {
      return undefined;
    }

    const linesToFind = predecessorLines || [];

    if (lineText) {
      linesToFind.push(lineText);
    }

    let searchStartPosition = 0;
    let lastFoundPosition = -1;

    for (const lineString of linesToFind) {
      const foundPosition = fileText.substr(searchStartPosition).search(RegExpEscape(lineString));

      if (foundPosition < 0) {
        return undefined;
      }
      lastFoundPosition = (searchStartPosition + foundPosition);
      searchStartPosition = (lastFoundPosition + lineString.length);
    }

    return fileText.substr(0, lastFoundPosition).split("\n").length - 1;
  }
}
