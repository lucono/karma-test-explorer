import { MockProxy, mock } from 'jest-mock-extended';

import { TestDefinitionProvider } from '../../src/core/base/test-definition-provider.js';
import { TestLocator } from '../../src/core/test-locator.js';
import { FileHandler } from '../../src/util/filesystem/file-handler.js';
import { Logger } from '../../src/util/logging/logger.js';
import { withUnixStyleSeparator } from '../test-util.js';

type FilePathTestData = { filePathStyle: string; mockTestFiles: string[] }[];
type FileGlobTestData = { globPathStyle: string; mockFileGlobs: string[] }[];

// --- Test Data ---

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

// --- Tests ---

describe('TestLocator', () => {
  let mockFileContent: string;
  let mockResolvedGlobFiles: string[];
  let testDefinitionProvider: MockProxy<TestDefinitionProvider>;
  let mockFileHandler: MockProxy<FileHandler>;
  let mockLogger: MockProxy<Logger>;

  beforeEach(() => {
    mockFileContent = '';
    mockResolvedGlobFiles = [];
    mockFileHandler = mock<FileHandler>();
    mockFileHandler.resolveFileGlobs.mockImplementation(() => Promise.resolve(mockResolvedGlobFiles));
    mockFileHandler.readFile.mockImplementation(() => Promise.resolve(mockFileContent));

    mockLogger = mock<Logger>();
    testDefinitionProvider = mock<TestDefinitionProvider>();
    testDefinitionProvider.getTestDefinitions.mockReturnValue([]);
  });

  filePathTestData.forEach(({ filePathStyle, mockTestFiles }) => {
    describe(`using ${filePathStyle} style paths`, () => {
      beforeEach(() => {
        mockResolvedGlobFiles = mockTestFiles;
        mockFileContent = 'some fake content';
      });

      fileGlobTestData.forEach(({ globPathStyle, mockFileGlobs }) => {
        describe(`and ${globPathStyle} style globs,`, () => {
          describe(`a new instance`, () => {
            let testLocator: TestLocator;

            beforeEach(async () => {
              testLocator = new TestLocator('/', mockFileGlobs, testDefinitionProvider, mockFileHandler, mockLogger);
              await testLocator.refreshFiles();
            });

            it('should process test content using the normalized file paths', () => {
              const expectedNormalizedTestFiles = [
                withUnixStyleSeparator(mockTestFiles[0]).replace(/^d:/, 'D:'),
                withUnixStyleSeparator(mockTestFiles[1]).replace(/^d:/, 'D:')
              ];

              expect(testDefinitionProvider.addFileContent).toHaveBeenCalledWith(
                mockFileContent,
                expectedNormalizedTestFiles[0]
              );

              expect(testDefinitionProvider.addFileContent).toHaveBeenCalledWith(
                mockFileContent,
                expectedNormalizedTestFiles[1]
              );
            });

            describe('isTestFile method', () => {
              it('should return true for files matching the designated test file patterns', () => {
                const result = testLocator.isTestFile('test/abc.test.ts');
                expect(result).toBe(true);
              });

              it('should return false for files not matching the designated test file patterns', () => {
                const result = testLocator.isTestFile('abc-spec.js');
                expect(result).toBe(false);
              });
            });
          });
        });
      });
    });
  });
});
