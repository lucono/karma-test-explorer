import globby from 'globby';
import { isMatch } from 'micromatch';
import { join, resolve } from 'path';
import { Disposable } from '../util/disposable/disposable';
import { Disposer } from '../util/disposable/disposer';
import { FileHandler } from '../util/file-handler';
import { DeferredPromise } from '../util/future/deferred-promise';
import { Logger } from '../util/logging/logger';
import { normalizePath } from '../util/utils';
import { TestDefinition } from './base/test-definition';
import { TestDefinitionProvider } from './base/test-definition-provider';

export interface TestDefinitionInfo {
  readonly test: TestDefinition;
  readonly suite: TestDefinition[];
}

export interface TestLocatorOptions extends globby.GlobbyOptions {
  cwd?: string;
  ignore?: string[];
  fileEncoding?: BufferEncoding;
}

export class TestLocator implements Disposable {
  private readonly testLocatorOptions: TestLocatorOptions;
  private readonly cwd: string;
  private refreshInProgress?: Promise<void>;
  private readonly disposables: Disposable[] = [];

  public constructor(
    private readonly fileGlobs: string[],
    private readonly testDefinitionProvider: TestDefinitionProvider,
    private readonly fileHandler: FileHandler,
    private readonly logger: Logger,
    testLocatorOptions: TestLocatorOptions = {}
  ) {
    this.disposables.push(logger, fileHandler);
    this.cwd = normalizePath(testLocatorOptions.cwd ?? process.cwd());
    this.testLocatorOptions = { ...testLocatorOptions, cwd: this.cwd };
    this.refreshFiles();
  }

  public async ready() {
    await this.refreshInProgress;
  }

  public async refreshFiles(files?: readonly string[]): Promise<void> {
    const filePaths = files?.map(file => normalizePath(file));
    const filesDescription = JSON.stringify(filePaths ?? this.fileGlobs);

    this.logger.debug(
      () => `Received request to refresh ${filePaths ? filePaths.length : 'all'} spec file(s): ${filesDescription}`
    );
    const deferredRefreshCompletion = new DeferredPromise();
    const futureRefreshCompletion = deferredRefreshCompletion.promise();

    const doRefresh = async () => {
      this.logger.debug(
        () => `Refreshing ${filePaths ? filePaths.length : 'all'} spec file(s): ` + `${filesDescription}`
      );
      this.logger.trace(() => `List of file(s) to refresh: ${JSON.stringify(filePaths)}`);

      const reloadStartTime = Date.now();

      if (filePaths) {
        this.testDefinitionProvider.removeFileContents(filePaths);
      } else {
        this.testDefinitionProvider.clearAllContent();
      }

      const filesToRefresh = filePaths ?? (await this.getAbsoluteFilesForGlobs(this.fileGlobs));
      let loadedFileCount: number = 0;

      for (const file of filesToRefresh) {
        const fileText = await this.fileHandler.readFile(file, this.testLocatorOptions.fileEncoding);
        this.testDefinitionProvider.addFileContent(file, fileText);
        loadedFileCount++;
      }

      if (this.refreshInProgress === futureRefreshCompletion) {
        this.refreshInProgress = undefined;
      }
      deferredRefreshCompletion.fulfill();
      const reloadSecs = (Date.now() - reloadStartTime) / 1000;

      this.logger.debug(
        () =>
          `Refreshed ${loadedFileCount} spec files ` +
          `from ${filePaths ? 'file list' : 'glob list'} ` +
          `in ${reloadSecs.toFixed(2)} secs: ${filesDescription}`
      );
    };

    if (this.refreshInProgress) {
      this.logger.debug(
        () => `Prior refresh still in progress - queing subsequent refresh for files: ${filesDescription}`
      );

      this.refreshInProgress.then(async () => await doRefresh());
      this.refreshInProgress = futureRefreshCompletion;
    } else {
      this.logger.debug(
        () => `No refresh currently in progress - will commence new refresh for files: ${filesDescription}`
      );

      this.refreshInProgress = futureRefreshCompletion;
      doRefresh();
    }
    return futureRefreshCompletion;
  }

  public removeFiles(absoluteFilePaths: string[]) {
    const normalizedPaths = absoluteFilePaths.map(filePath => normalizePath(filePath));
    this.testDefinitionProvider.removeFileContents(normalizedPaths);
  }

  public getTestDefinitions(specSuite: string[], specDescription: string): TestDefinitionInfo[] {
    return this.testDefinitionProvider.getTestDefinitions(specSuite, specDescription);
  }

  public isTestFile(filePath: string): boolean {
    const absoluteFilePath = normalizePath(resolve(this.cwd, filePath));
    const absoluteFilePatterns = this.fileGlobs.map(pattern => normalizePath(join(this.cwd, pattern)));

    const isSpecFilePath = isMatch(absoluteFilePath, absoluteFilePatterns, {
      cwd: this.cwd,
      ignore: this.testLocatorOptions.ignore
    });

    this.logger.debug(
      () => `File is determined to ${isSpecFilePath ? 'be' : 'not be'} a spec file: ${absoluteFilePath}`
    );
    return isSpecFilePath;
  }

  private async getAbsoluteFilesForGlobs(fileGlobs: string[]): Promise<string[]> {
    const filePaths = await this.fileHandler.resolveFileGlobs(fileGlobs, this.testLocatorOptions);
    const normalizedPaths = filePaths.map(path => normalizePath(path));
    return normalizedPaths;
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
