import globby from 'globby';
import { Disposable } from '../disposable/disposable';

export interface FileHandler extends Disposable {
  existsSync(filePath: string): boolean;

  readFile(filePath: string, encoding?: BufferEncoding): Promise<string>;

  readFileSync(filePath: string, encoding?: BufferEncoding): string | undefined;

  resolveFileGlobs(filePatterns: string[], globOptions?: globby.GlobbyOptions): Promise<string[]>;
}
