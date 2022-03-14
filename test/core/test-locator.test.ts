import { mock, MockProxy } from 'jest-mock-extended';
import { TestDefinitionState } from '../../src/core/base/test-definition';
import { TestDefinitionProvider } from '../../src/core/base/test-definition-provider';
import { TestType } from '../../src/core/base/test-infos';
import { TestNodeType } from '../../src/core/base/test-node';
import { RegexTestDefinitionProvider } from '../../src/core/parser/regex-test-definition-provider';
import { RegexTestFileParser, RegexTestFileParserResult } from '../../src/core/parser/regex-test-file-parser';
import { TestLocator } from '../../src/core/test-locator';
import { FileHandler } from '../../src/util/file-handler';
import { Logger } from '../../src/util/logging/logger';
import { withUnixStyleSeparator } from '../test-util';

type FilePathTestData = { filePathStyle: string; mockTestFiles: string[] }[];
type FileGlobTestData = { globPathStyle: string; mockFileGlobs: string[] }[];

describe('TestLocator', () => {
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

  let mockTestFileParser: MockProxy<RegexTestFileParser>;
  let testDefinitionProvider: TestDefinitionProvider;
  let mockFileHandler: MockProxy<FileHandler>;
  let mockLogger: MockProxy<Logger>;
  let mockResolvedGlobFiles: string[];

  beforeEach(() => {
    mockResolvedGlobFiles = [];
    mockLogger = mock<Logger>();
    mockFileHandler = mock<FileHandler>();
    mockFileHandler.resolveFileGlobs.mockImplementation(() => Promise.resolve(mockResolvedGlobFiles));
    mockTestFileParser = mock<RegexTestFileParser>();
    testDefinitionProvider = new RegexTestDefinitionProvider(mockTestFileParser, mockLogger);

    mockTestFileParser.parseFileText.mockReturnValue(<RegexTestFileParserResult>{
      Suite: [{ type: TestNodeType.Suite, description: 'SuiteName', line: 1, state: TestDefinitionState.Default }],
      Test: [{ type: TestNodeType.Test, description: 'TestName', line: 2, state: TestDefinitionState.Default }]
    });
  });

  describe.each(filePathTestData)('using $filePathStyle style paths', ({ mockTestFiles }) => {
    beforeEach(() => {
      mockResolvedGlobFiles = mockTestFiles;
    });

    describe.each(fileGlobTestData)('and $globPathStyle style globs', ({ mockFileGlobs }) => {
      let testLocator: TestLocator;

      beforeEach(async () => {
        testLocator = new TestLocator(mockFileGlobs, testDefinitionProvider, mockFileHandler, mockLogger);
        await testLocator.refreshFiles();
      });

      describe('the get test definitions method', () => {
        it('should return the test definitions with normalized file paths', () => {
          const testDefinitions = testLocator.getTestDefinitions(['SuiteName'], 'TestName');

          const expectedNormalizedTestFiles = [
            withUnixStyleSeparator(mockTestFiles[0]).replace(/^d:/, 'D:'),
            withUnixStyleSeparator(mockTestFiles[1]).replace(/^d:/, 'D:')
          ];

          expect(testDefinitions).toEqual([
            expect.objectContaining({
              test: expect.objectContaining({ file: expectedNormalizedTestFiles[0] })
            }),
            expect.objectContaining({
              test: expect.objectContaining({ file: expectedNormalizedTestFiles[1] })
            })
          ]);
        });
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

      describe('and using more complex test file content with nesting and some identical descriptions', () => {
        const mockTestFilePath = 'path/to/random/test/file';

        beforeEach(async () => {
          mockTestFileParser.parseFileText.mockReturnValue(<RegexTestFileParserResult>{
            Suite: [
              {
                type: TestNodeType.Suite,
                description: 'test suite 1',
                line: 1,
                state: TestDefinitionState.Default
              },
              {
                type: TestNodeType.Suite,
                description: 'test suite 1-1',
                line: 2,
                state: TestDefinitionState.Default
              },
              {
                type: TestNodeType.Suite,
                description: 'identical inner suite',
                line: 3,
                state: TestDefinitionState.Default
              },
              {
                type: TestNodeType.Suite,
                description: 'test suite 1-2',
                line: 9,
                state: TestDefinitionState.Default
              },
              {
                type: TestNodeType.Suite,
                description: 'identical inner suite',
                line: 10,
                state: TestDefinitionState.Default
              }
            ],
            Test: [
              {
                type: TestNodeType.Test,
                description: 'identical inner test',
                line: 4,
                state: TestDefinitionState.Default
              },
              {
                type: TestNodeType.Test,
                description: 'identical inner test',
                line: 11,
                state: TestDefinitionState.Default
              }
            ]
          });

          mockResolvedGlobFiles = [mockTestFilePath];
          testLocator = new TestLocator(mockFileGlobs, testDefinitionProvider, mockFileHandler, mockLogger);
          await testLocator.refreshFiles();
        });

        describe('the get test definitions method', () => {
          it('should return the correct test definitions for the occurring identical test descriptions', () => {
            const identicalTestDefinition1 = testLocator.getTestDefinitions(
              ['test suite 1', 'test suite 1-1', 'identical inner suite'],
              'identical inner test'
            );
            const identicalTestDefinition2 = testLocator.getTestDefinitions(
              ['test suite 1', 'test suite 1-2', 'identical inner suite'],
              'identical inner test'
            );

            expect(identicalTestDefinition1).toEqual([
              {
                test: {
                  description: 'identical inner test',
                  type: TestType.Test,
                  state: TestDefinitionState.Default,
                  disabled: false,
                  file: mockTestFilePath,
                  line: 4
                },
                suite: [
                  {
                    description: 'test suite 1',
                    type: TestType.Suite,
                    state: TestDefinitionState.Default,
                    disabled: false,
                    file: mockTestFilePath,
                    line: 1
                  },
                  {
                    description: 'test suite 1-1',
                    type: TestType.Suite,
                    state: TestDefinitionState.Default,
                    disabled: false,
                    file: mockTestFilePath,
                    line: 2
                  },
                  {
                    description: 'identical inner suite',
                    type: TestType.Suite,
                    state: TestDefinitionState.Default,
                    disabled: false,
                    file: mockTestFilePath,
                    line: 3
                  }
                ]
              }
            ]);

            expect(identicalTestDefinition2).toEqual([
              {
                test: {
                  description: 'identical inner test',
                  type: TestType.Test,
                  state: TestDefinitionState.Default,
                  disabled: false,
                  file: mockTestFilePath,
                  line: 11
                },
                suite: [
                  {
                    description: 'test suite 1',
                    type: TestType.Suite,
                    state: TestDefinitionState.Default,
                    disabled: false,
                    file: mockTestFilePath,
                    line: 1
                  },
                  {
                    description: 'test suite 1-2',
                    type: TestType.Suite,
                    state: TestDefinitionState.Default,
                    disabled: false,
                    file: mockTestFilePath,
                    line: 9
                  },
                  {
                    description: 'identical inner suite',
                    type: TestType.Suite,
                    state: TestDefinitionState.Default,
                    disabled: false,
                    file: mockTestFilePath,
                    line: 10
                  }
                ]
              }
            ]);
          });
        });
      });
    });
  });
});
