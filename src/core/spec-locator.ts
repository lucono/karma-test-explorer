import globby from 'globby';
import { isMatch } from 'micromatch';
import { join, resolve } from 'path';
import { Disposable } from '../util/disposable/disposable';
import { Disposer } from '../util/disposable/disposer';
import { FileHandler } from '../util/file-handler';
import { DeferredPromise } from '../util/future/deferred-promise';
import { Logger } from '../util/logging/logger';
import { normalizePath } from '../util/utils';
import { TestFileParser, TestNodeInfo, TestNodeType, TestSuiteFileInfo } from './test-file-parser';

export interface SpecLocation {
  file: string;
  line: number;
}

export interface SpecFileInfo {
  suiteName: string;
  specCount: number;
}

export interface SpecLocatorOptions extends globby.GlobbyOptions {
  cwd?: string;
  ignore?: string[];
  fileEncoding?: BufferEncoding;
}

export class SpecLocator implements Disposable {
  private readonly fileInfoMap: Map<string, TestSuiteFileInfo> = new Map();
  private readonly specFilesBySuite: Map<string, string[]> = new Map();
  private readonly specLocatorOptions: SpecLocatorOptions;
  private readonly cwd: string;
  private refreshInProgress?: Promise<void>;
  private readonly disposables: Disposable[] = [];

  public constructor(
    private readonly filePatterns: string[],
    private readonly testFileParser: TestFileParser,
    private readonly fileHandler: FileHandler,
    private readonly logger: Logger,
    specLocatorOptions: SpecLocatorOptions = {}
  ) {
    this.disposables.push(logger, fileHandler);
    this.cwd = normalizePath(specLocatorOptions.cwd ?? process.cwd());
    this.specLocatorOptions = { ...specLocatorOptions, cwd: this.cwd };
    this.refreshFiles();
  }

  public async ready() {
    await this.refreshInProgress;
  }

  public async refreshFiles(files?: string[]): Promise<void> {
    const posixPaths = files?.map(f => normalizePath(f));
    const filesDescriptionList = JSON.stringify(posixPaths ?? this.filePatterns);

    this.logger.debug(
      () =>
        `Received request to refresh ${posixPaths ? posixPaths.length : 'all'} spec file(s): ` +
        `${filesDescriptionList}`
    );
    const deferredRefreshCompletion = new DeferredPromise();
    const futureRefreshCompletion = deferredRefreshCompletion.promise();

    const doRefresh = async () => {
      this.logger.debug(
        () => `Refreshing ${posixPaths ? posixPaths.length : 'all'} spec file(s): ` + `${filesDescriptionList}`
      );
      this.logger.trace(() => `List of file(s) to refresh: ${JSON.stringify(posixPaths)}`);

      const reloadStartTime = Date.now();
      this.purgeFiles(posixPaths ?? undefined);

      const filesToRefresh = posixPaths ?? (await this.getAbsoluteFilesForGlobs(this.filePatterns));
      let loadedFileCount: number = 0;

      for (const file of filesToRefresh) {
        await this.processFile(file);
        loadedFileCount++;
      }

      if (this.refreshInProgress === futureRefreshCompletion) {
        this.refreshInProgress = undefined;
      }
      deferredRefreshCompletion.fulfill();
      const reloadSecs = (Date.now() - reloadStartTime) / 1000;

      this.logger.debug(
        () =>
          `Refreshed ${loadedFileCount} spec ${posixPaths ? 'files' : 'globs'} ` +
          `in ${reloadSecs.toFixed(2)} secs: ${filesDescriptionList}`
      );
    };

    if (this.refreshInProgress) {
      this.logger.debug(
        () => `Prior refresh still in progress - queing subsequent refresh for files: ${filesDescriptionList}`
      );

      this.refreshInProgress.then(async () => await doRefresh());
      this.refreshInProgress = futureRefreshCompletion;
    } else {
      this.logger.debug(
        () => `No refresh currently in progress - will commence new refresh for files: ${filesDescriptionList}`
      );

      this.refreshInProgress = futureRefreshCompletion;
      doRefresh();
    }
    return futureRefreshCompletion;
  }

  public removeFiles(absoluteFilePaths: string[]) {
    const posixFilePaths = absoluteFilePaths.map(path => normalizePath(path));
    this.purgeFiles(posixFilePaths);
  }

  private purgeFiles(absoluteFilePaths?: string[]) {
    if (!absoluteFilePaths) {
      this.fileInfoMap.clear();
      this.specFilesBySuite.clear();
      return;
    }

    absoluteFilePaths.forEach(fileToPurge => {
      if (!this.fileInfoMap.has(fileToPurge)) {
        return;
      }
      this.fileInfoMap.delete(fileToPurge);

      Array.from(this.specFilesBySuite.entries()).forEach((suiteToFilesEntry: [string, string[]]) => {
        const suite = suiteToFilesEntry[0];
        const files = suiteToFilesEntry[1];

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

  private async processFile(fileAbsolutePath: string) {
    this.logger.trace(() => `Processing spec file: ${fileAbsolutePath}`);

    const fileText = await this.fileHandler.readFile(fileAbsolutePath, this.specLocatorOptions.fileEncoding);
    const fileTestInfo = this.testFileParser.parseFileText(fileText);
    this.fileInfoMap.set(fileAbsolutePath, fileTestInfo);

    if (fileTestInfo[TestNodeType.Suite].length === 0) {
      this.logger.warn(() => `No tests found in spec file: ${fileAbsolutePath}`);
      return;
    }
    this.logger.debug(
      () => `Found ${fileTestInfo[TestNodeType.Test].length} test(s) in spec file: ${fileAbsolutePath}`
    );

    const fileTopSuite = [fileTestInfo[TestNodeType.Suite][0].description];
    this.addSuiteFileToCache(fileTopSuite, fileAbsolutePath);
  }

  public getSpecLocation(specSuite: string[], specDescription?: string): SpecLocation[] {
    if (specSuite.length === 0) {
      return [];
    }
    const specFiles = this.getSuiteFilesFromCache(specSuite);

    if (specFiles) {
      const specLocations: SpecLocation[] = specFiles
        .map((specFile: string): SpecLocation | undefined => {
          const specLine = this.getSpecLineNumber(this.fileInfoMap.get(specFile), specSuite, specDescription);
          return specLine ? { file: specFile, line: specLine } : undefined;
        })
        .filter(specLocation => specLocation !== undefined) as SpecLocation[];

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

  public isSpecFile(filePath: string): boolean {
    const absoluteFilePath = resolve(this.cwd, filePath);
    const absoluteFilePatterns = this.filePatterns.map(pattern => normalizePath(join(this.cwd, pattern)));

    const isSpecFilePath = isMatch(absoluteFilePath, absoluteFilePatterns, {
      cwd: this.cwd,
      ignore: this.specLocatorOptions.ignore
    });

    this.logger.debug(
      () => `File is determined to ${isSpecFilePath ? 'be' : 'not be'} a spec file: ${absoluteFilePath}`
    );
    return isSpecFilePath;
  }

  private async getAbsoluteFilesForGlobs(fileGlobs: string[]): Promise<string[]> {
    const filePaths = await this.fileHandler.resolveFileGlobs(fileGlobs, this.specLocatorOptions);
    const normalizedPaths = filePaths.map(path => normalizePath(path));
    return normalizedPaths;
  }

  private addSuiteFileToCache(suite: string[], filePath: string) {
    this.logger.debug(() => `Adding spec file to cache: ${filePath}`);
    let suiteKey = '';

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

  private getSpecLineNumber(
    testFileNodeList: TestSuiteFileInfo | undefined,
    specSuite: string[] | undefined,
    specDescription?: string | undefined
  ): number | undefined {
    if (!testFileNodeList || !specSuite) {
      return undefined;
    }

    const findNode = (
      nodeType: TestNodeType,
      nodeDescription: string,
      startNode?: TestNodeInfo,
      inclusive: boolean = false
    ): TestNodeInfo | undefined => {
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

    const suiteNamesToFind = specSuite ?? [];
    let lastSuiteNodeFound: TestNodeInfo | undefined;

    for (const suiteName of suiteNamesToFind) {
      lastSuiteNodeFound = findNode(TestNodeType.Suite, suiteName);

      if (!lastSuiteNodeFound) {
        break;
      }
    }

    if (lastSuiteNodeFound?.lineNumber === undefined) {
      return undefined;
    }

    if (specDescription === undefined) {
      return lastSuiteNodeFound.lineNumber;
    }

    const itSearchStartNode = testFileNodeList[TestNodeType.Test].find(
      testNode =>
        testNode.lineNumber !== undefined &&
        lastSuiteNodeFound!.lineNumber !== undefined &&
        testNode.lineNumber > lastSuiteNodeFound!.lineNumber
    );

    if (itSearchStartNode === undefined) {
      return undefined;
    }

    const itSpecFoundNode = findNode(TestNodeType.Test, specDescription, itSearchStartNode, true);

    if (!itSpecFoundNode) {
      return undefined;
    }

    return itSpecFoundNode.lineNumber;
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
