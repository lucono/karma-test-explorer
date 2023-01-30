import { existsSync, readFile, readFileSync } from 'fs';
import { Options as GlobbyOptions, globby } from 'globby';

import { DEFAULT_FILE_ENCODING } from '../../constants.js';
import { Disposable } from '../disposable/disposable.js';
import { Disposer } from '../disposable/disposer.js';
import { DeferredPromise } from '../future/deferred-promise.js';
import { Logger } from '../logging/logger.js';
import { normalizePath } from '../utils.js';
import { FileHandler } from './file-handler.js';

const DEFAULT_GLOB_OPTIONS: GlobbyOptions = {
  unique: true,
  absolute: true,
  baseNameMatch: false,
  onlyFiles: true,
  gitignore: true
};

export interface SimpleFileHandlerOptions extends GlobbyOptions {
  cwd?: string;
  fileEncoding?: BufferEncoding;
}

export class SimpleFileHandler implements FileHandler {
  private readonly fileHandlerOptions: SimpleFileHandlerOptions;
  private readonly fileEncoding: BufferEncoding;
  private readonly disposables: Disposable[] = [];

  public constructor(private readonly logger: Logger, fileHandlerOptions: SimpleFileHandlerOptions = {}) {
    this.disposables.push(logger);
    this.fileEncoding = fileHandlerOptions.fileEncoding ?? DEFAULT_FILE_ENCODING;

    this.fileHandlerOptions = {
      ...fileHandlerOptions,
      fileEncoding: this.fileEncoding,
      cwd: fileHandlerOptions.cwd ?? process.cwd()
    };
  }

  public existsSync(filePath: string): boolean {
    return existsSync(filePath);
  }

  public readFileSync(filePath: string, encoding?: BufferEncoding): string | undefined {
    this.logger.debug(() => `Reading file synchronously: ${filePath}`);
    let fileContents: string | undefined;

    try {
      fileContents = readFileSync(filePath, encoding ?? this.fileEncoding);
    } catch (error) {
      this.logger.error(() => `Failed reading file ${filePath}: ${error}`);
    }
    return fileContents;
  }

  public async readFile(filePath: string, encoding?: BufferEncoding): Promise<string> {
    this.logger.debug(() => `Reading file async: ${filePath}`);
    const deferredFileContents = new DeferredPromise<string>();

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

  public async resolveFileGlobs(filePatterns: string[], globOptions: GlobbyOptions = {}): Promise<string[]> {
    try {
      const searchOptions = { ...DEFAULT_GLOB_OPTIONS, ...this.fileHandlerOptions, ...globOptions };
      const files = (await globby(filePatterns, searchOptions)).map(file => normalizePath(file));

      this.logger.debug(() => `Resolved ${files.length} file(s) from file patterns: ${JSON.stringify(filePatterns)}`);

      this.logger.trace(
        () =>
          `List of resolved files from file patterns: ${JSON.stringify(filePatterns)} ` +
          `using options: ${JSON.stringify(searchOptions, null, 2)} ` +
          `are: ${JSON.stringify(files, null, 2)}`
      );
      return files;
    } catch (error) {
      const errorMsg = `Failed to resolve files from file patterns: ${JSON.stringify(filePatterns)}: \n${error}`;
      this.logger.error(() => errorMsg);
      throw new Error(errorMsg);
    }
  }

  public async dispose() {
    await Disposer.dispose(this.disposables);
  }
}
