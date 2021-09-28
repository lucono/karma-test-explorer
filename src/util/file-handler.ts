import { readFile } from 'fs';
import globby from 'globby';
import { DEFAULT_FILE_ENCODING } from '../constants';
import { Disposable } from './disposable/disposable';
import { Disposer } from './disposable/disposer';
import { DeferredPromise } from './future/deferred-promise';
import { Logger } from './logging/logger';

const DEFAULT_GLOB_OPTIONS: globby.GlobbyOptions = {
  unique: true,
  absolute: true,
  baseNameMatch: false,
  onlyFiles: true,
  gitignore: true
};

export interface FileHandlerOptions extends globby.GlobbyOptions {
  cwd?: string;
  fileEncoding?: BufferEncoding;
}

export class FileHandler implements Disposable {
  private readonly fileHandlerOptions: FileHandlerOptions;
  private readonly fileEncoding: BufferEncoding;
  private readonly cwd: string;
  private readonly disposables: Disposable[] = [];

  public constructor(private readonly logger: Logger, fileHandlerOptions: FileHandlerOptions = {}) {
    this.disposables.push(logger);
    this.fileEncoding = fileHandlerOptions.fileEncoding ?? DEFAULT_FILE_ENCODING;
    this.cwd = fileHandlerOptions.cwd ?? process.cwd();

    this.fileHandlerOptions = {
      ...fileHandlerOptions,
      fileEncoding: this.fileEncoding,
      cwd: this.cwd
    };
  }

  public async readFile(filePath: string, encoding?: BufferEncoding): Promise<string> {
    const deferredFileContents = new DeferredPromise<string>();
    this.logger.debug(() => `Reading file: ${filePath}`);

    readFile(filePath, encoding ?? this.fileEncoding, (error, data) => {
      if (error) {
        this.logger.error(() => `Failed reading file ${filePath}: ${error}`);
        deferredFileContents.reject(new Error(`Failed to read file '${filePath}': ${error}`));
      } else {
        this.logger.trace(() => `Done reading file ${filePath}: ${error}`);
        deferredFileContents.fulfill(data?.toString());
      }
    });
    return deferredFileContents.promise();
  }

  public async resolveFileGlobs(filePatterns: string[], globOptions: globby.GlobbyOptions = {}): Promise<string[]> {
    const searchOptions = { ...DEFAULT_GLOB_OPTIONS, ...this.fileHandlerOptions, ...globOptions };
    const files = await globby(filePatterns, searchOptions);

    this.logger.debug(
      () =>
        `Resolved ${files.length} file(s) from file patterns (${filePatterns}) ` +
        `using options: ${JSON.stringify(searchOptions)}`
    );
    this.logger.trace(
      () => `List of resolved files from file patterns (${filePatterns}) are: ${JSON.stringify(files, null, 2)}`
    );
    return files;
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
