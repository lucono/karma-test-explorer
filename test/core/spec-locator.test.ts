import { mock, MockProxy } from 'jest-mock-extended';
import { SpecLocator } from '../../src/core/spec-locator';
import { TestFileParser, TestSuiteFileInfo } from '../../src/core/test-file-parser';
import { FileHandler } from '../../src/util/file-handler';
import { Logger } from '../../src/util/logging/logger';

describe('SpecLocator', () => {
  const testFiles = [
    'C:\\test\\path\\abc.test.ts',
    'C:\\test\\path\\def.test.ts',
    'C:\\test\\path\\geh.test.ts',
    'C:/test/path/abc.test.ts',
    'C:/test/path/def.test.ts',
    'C:/test/path/geh.test.ts'
  ];
  const unixFilePatterns: string[] = ['**/*.test.ts'];
  const windowsFilePatterns: string[] = ['**\\*.test.ts'];

  let mockTestFileParser: MockProxy<TestFileParser>;
  let mockFileHandler: MockProxy<FileHandler>;
  let mockLogger: MockProxy<Logger>;

  let specLocator: SpecLocator;

  beforeEach(() => {
    mockTestFileParser = mock<TestFileParser>();
    mockTestFileParser.parseFileText.mockReturnValue(<TestSuiteFileInfo>{
      Suite: [{ description: 'SuiteName', lineNumber: 1 }],
      Test: [{ description: 'TestName', lineNumber: 2 }]
    });

    mockFileHandler = mock<FileHandler>();

    mockFileHandler.resolveFileGlobs.mockReturnValue(Promise.resolve(testFiles));

    mockLogger = mock<Logger>();

    specLocator = new SpecLocator(
      [...unixFilePatterns, ...windowsFilePatterns],
      mockTestFileParser,
      mockFileHandler,
      mockLogger
    );
  });

  describe('constructor', () => {
    it('should build spec locator', () => {
      expect(specLocator).not.toBeUndefined();
      expect(specLocator).not.toBeNull();
    });

    it('should populate cache', async () => {
      await specLocator.ready();

      expect(specLocator['specFilesBySuite'].size).toEqual(1);
      expect(specLocator['specFilesBySuite'].get('SuiteName')?.length).toEqual(3);
    });
  });

  describe('getSpecLocation method', () => {
    it('should return paths with unix-style path separators', () => {
      const specLocations = specLocator.getSpecLocation(['SuiteName']);

      expect(specLocations.every(s => !s.file.includes('\\'))).toBeTruthy();
    });
  });

  describe('isSpecFile method', () => {
    it('should return true for files matching the designated test file patterns', () => {
      const result = specLocator.isSpecFile('abc.test.ts');

      expect(result).toBeTruthy();
    });

    it('should return false for files not matching the designated test file patterns', () => {
      const result = specLocator.isSpecFile('abc.spec.ts');

      expect(result).toBeFalsy();
    });
  });

  describe('refreshFiles method', () => {
    it('should use unix-style path separators in cache entries', async () => {
      await specLocator.refreshFiles(testFiles);

      expect(specLocator['specFilesBySuite'].get('SuiteName')?.every(s => !s.includes('\\'))).toBeTruthy();
    });
  });

  describe('removeFiles method', () => {
    it('should remove matching files from cache using windows-style path separators', () => {
      specLocator.removeFiles(['C:\\test\\path\\abc.test.ts']);

      expect(specLocator['specFilesBySuite'].get('SuiteName')?.length).toEqual(2);
    });

    it('should remove matching files from cache using unix-style path separators', () => {
      specLocator.removeFiles(['C:/test/path/abc.test.ts']);

      expect(specLocator['specFilesBySuite'].get('SuiteName')?.length).toEqual(2);
    });

    it('should not remove any files from cache for empty array', () => {
      specLocator.removeFiles([]);

      expect(specLocator['specFilesBySuite'].get('SuiteName')?.length).toEqual(3);
    });
  });
});
