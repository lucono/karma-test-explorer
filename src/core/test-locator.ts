import globby from 'globby';
import { isMatch } from 'micromatch';
import { join, resolve } from 'path';
import { Disposable } from '../util/disposable/disposable';
import { Disposer } from '../util/disposable/disposer';
import { FileHandler } from '../util/filesystem/file-handler';
import { DeferredPromise } from '../util/future/deferred-promise';
import { Logger } from '../util/logging/logger';
import { isChildPath, normalizePath } from '../util/utils';
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
  private pendingRefreshCompletion?: Promise<void>;
  private readonly disposables: Disposable[] = [];

  public constructor(
    private readonly basePath: string,
    private readonly fileGlobs: string[],
    private readonly testDefinitionProvider: TestDefinitionProvider,
    private readonly fileHandler: FileHandler,
    private readonly logger: Logger,
    testLocatorOptions: TestLocatorOptions = {}
  ) {
    this.disposables.push(logger, fileHandler);
    this.cwd = normalizePath(testLocatorOptions.cwd ?? process.cwd());
    this.testLocatorOptions = { ...testLocatorOptions, cwd: this.cwd };
  }

  public async ready(): Promise<void> {
    return this.pendingRefreshCompletion;
  }

  public async refreshFiles(files?: readonly string[]): Promise<void> {
    const filePaths = files?.map(file => normalizePath(file));
    const filesDescription = JSON.stringify(filePaths ?? this.fileGlobs);

    this.logger.debug(
      () => `Refresh requested for ${filePaths ? filePaths.length : 'all'} spec file(s): ${filesDescription}`
    );
    const deferredRefreshCompletion = new DeferredPromise();
    const futureRefreshCompletion = deferredRefreshCompletion.promise();

    const doRefresh = async () => {
      this.logger.debug(
        () => `Refreshing ${filePaths ? filePaths.length : 'all'} spec file(s): ` + `${filesDescription}`
      );
      const reloadStartTime = Date.now();

      if (filePaths) {
        this.testDefinitionProvider.removeFileContents(filePaths);
      } else {
        this.testDefinitionProvider.clearAllContent();
      }

      try {
        const requestedFilesToRefresh = filePaths ?? (await this.getAbsoluteFilesForGlobs(this.fileGlobs));
        const filesToRefresh = requestedFilesToRefresh.filter(file => isChildPath(this.basePath, file));
        let loadedFileCount: number = 0;

        this.logger.debug(
          () =>
            `Requested --> filtered file count to refresh: ` +
            `${requestedFilesToRefresh.length} --> ${filesToRefresh.length}`
        );

        this.logger.trace(
          () =>
            `Requested list of file(s) to refresh: ${JSON.stringify(requestedFilesToRefresh, null, 2)} \n` +
            `--> Filtered list of file(s) to refresh: ${JSON.stringify(filesToRefresh, null, 2)}`
        );

        for (const file of filesToRefresh) {
          try {
            const fileText = await this.fileHandler.readFile(file, this.testLocatorOptions.fileEncoding);
            this.testDefinitionProvider.addFileContent(fileText, file);
            loadedFileCount++;
          } catch (error) {
            this.logger.error(() => `Failed to get tests from spec file ${file}: ${error}`);
          }
        }
        const reloadSecs = (Date.now() - reloadStartTime) / 1000;

        this.logger.debug(
          () =>
            `Refreshed ${loadedFileCount} spec files ` +
            `from ${filePaths ? 'file list' : 'glob list'} ` +
            `in ${reloadSecs.toFixed(2)} secs: ${filesDescription}`
        );
        deferredRefreshCompletion.fulfill();
      } catch (error) {
        this.logger.error(() => `Failed to load spec files - ${filesDescription}: ${error}`);
        deferredRefreshCompletion.reject();
      }

      if (this.pendingRefreshCompletion === futureRefreshCompletion) {
        this.pendingRefreshCompletion = undefined;
      }
    };

    const lastPendingRefresh = this.pendingRefreshCompletion;
    this.pendingRefreshCompletion = futureRefreshCompletion;

    if (lastPendingRefresh) {
      this.logger.debug(
        () => `Prior refresh still in progress - queing subsequent refresh for files: ${filesDescription}`
      );

      lastPendingRefresh.then(() => doRefresh());
    } else {
      this.logger.debug(
        () => `No refresh currently in progress - will commence new refresh for files: ${filesDescription}`
      );

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
