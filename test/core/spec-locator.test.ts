import { mock, MockProxy } from 'jest-mock-extended';
import { SpecLocator } from '../../src/core/spec-locator';
import { TestFileParser, TestSuiteFileInfo } from '../../src/core/test-file-parser';
import { FileHandler } from '../../src/util/file-handler';
import { Logger } from '../../src/util/logging/logger';
import { withUnixStyleSeparator } from '../test-util';

type FilePathTestData = { filePathStyle: string; mockTestFiles: string[] }[];
type FileGlobTestData = { globPathStyle: string; mockFileGlobs: string[] }[];

describe('SpecLocator', () => {
  const windowsBackSlashTestFiles = ['D:\\test\\path\\abc.test.ts', 'd:\\test\\path\\def.test.ts'];
  const windowsForwardSlashTestFiles = ['D:/test/path/abc.test.ts', 'd:/test/path/def.test.ts'];
  const unixStyleTestFiles = ['/test/path/abc.test.ts', '/test/path/def.test.ts'];

  const windowsBackSlashFileGlobs = ['**\\*.test.ts'];
  const unixStyleFileGlobs = ['**/*.test.ts'];

  const windowsPathsTestData: FilePathTestData = [
    { filePathStyle: 'Windows back slash', mockTestFiles: windowsBackSlashTestFiles },
    { filePathStyle: 'Windows forward slash', mockTestFiles: windowsForwardSlashTestFiles }
  ];
  const unixPathsTestData: FilePathTestData = [{ filePathStyle: 'Unix', mockTestFiles: unixStyleTestFiles }];
  const filePathTestData = process.platform === 'win32' ? windowsPathsTestData : unixPathsTestData;

  const fileGlobTestData: FileGlobTestData =
    process.platform === 'win32'
      ? [{ globPathStyle: 'Windows back slash', mockFileGlobs: windowsBackSlashFileGlobs }]
      : [{ globPathStyle: 'Unix', mockFileGlobs: unixStyleFileGlobs }];

  let mockTestFileParser: MockProxy<TestFileParser>;
  let mockFileHandler: MockProxy<FileHandler>;
  let mockLogger: MockProxy<Logger>;
  let mockResolvedGlobFiles: string[];

  beforeEach(() => {
    mockResolvedGlobFiles = [];
    mockLogger = mock<Logger>();
    mockFileHandler = mock<FileHandler>();
    mockFileHandler.resolveFileGlobs.mockImplementation(() => Promise.resolve(mockResolvedGlobFiles));
    mockTestFileParser = mock<TestFileParser>();

    mockTestFileParser.parseFileText.mockReturnValue(<TestSuiteFileInfo>{
      Suite: [{ description: 'SuiteName', lineNumber: 1 }],
      Test: [{ description: 'TestName', lineNumber: 2 }]
    });
  });

  describe.each(filePathTestData)('using $filePathStyle style paths', ({ mockTestFiles }) => {
    beforeEach(() => {
      mockResolvedGlobFiles = mockTestFiles;
    });

    describe.each(fileGlobTestData)('and $globPathStyle style globs', ({ mockFileGlobs }) => {
      let specLocator: SpecLocator;

      beforeEach(() => {
        specLocator = new SpecLocator(mockFileGlobs, mockTestFileParser, mockFileHandler, mockLogger);
      });

      describe('the getSpecLocation method', () => {
        it('should return the spec locations with normalized file paths', () => {
          const specLocations = specLocator.getSpecLocation(['SuiteName']);

          const expectedNormalizedTestFiles = [
            withUnixStyleSeparator(mockTestFiles[0]).replace(/^d:/, 'D:'),
            withUnixStyleSeparator(mockTestFiles[1]).replace(/^d:/, 'D:')
          ];

          expect(specLocations).toEqual([
            expect.objectContaining({ file: expectedNormalizedTestFiles[0] }),
            expect.objectContaining({ file: expectedNormalizedTestFiles[1] })
          ]);
        });
      });

      describe('isSpecFile method', () => {
        it('should return true for files matching the designated test file patterns', () => {
          const result = specLocator.isSpecFile('test/abc.test.ts');
          expect(result).toBe(true);
        });

        it('should return false for files not matching the designated test file patterns', () => {
          const result = specLocator.isSpecFile('abc-spec.js');
          expect(result).toBe(false);
        });
      });

      describe('refreshFiles method', () => {
        it('should load the specified files into the cache', async () => {
          await specLocator.refreshFiles(['xyz.test.ts']);
          expect(specLocator['specFilesBySuite'].get('SuiteName')).toEqual(expect.arrayContaining(['xyz.test.ts']));
        });

        it('should clear and reload cache using the file globs if no files specified', async () => {
          const modifiedGlobFiles = ['file1.test.ts', 'file2.test.ts', 'file3.test.ts'];

          expect(specLocator['specFilesBySuite'].get('SuiteName')).not.toEqual(
            expect.arrayContaining(modifiedGlobFiles)
          );

          mockResolvedGlobFiles = modifiedGlobFiles;
          await specLocator.refreshFiles();

          expect(specLocator['specFilesBySuite'].get('SuiteName')).toEqual(expect.arrayContaining(modifiedGlobFiles));
        });
      });

      describe('removeFiles method', () => {
        it('should remove matching files from the cache', () => {
          expect(specLocator['specFilesBySuite'].get('SuiteName')?.length).toEqual(2);
          specLocator.removeFiles([mockTestFiles[0]]);
          expect(specLocator['specFilesBySuite'].get('SuiteName')?.length).toEqual(1);
        });

        it('should not remove any files from cache for empty array', () => {
          specLocator.removeFiles([]);
          expect(specLocator['specFilesBySuite'].get('SuiteName')?.length).toEqual(2);
        });
      });
    });
  });
});
