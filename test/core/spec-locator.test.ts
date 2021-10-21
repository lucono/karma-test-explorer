import { mock, MockProxy } from 'jest-mock-extended';
import { SpecLocator } from '../../src/core/spec-locator';
import { TestFileParser, TestSuiteFileInfo } from '../../src/core/test-file-parser';
import { FileHandler } from '../../src/util/file-handler';
import { Logger } from '../../src/util/logging/logger';

describe('SpecLocator', () => {
  const testFilePatterns: string[] = [];
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
    mockFileHandler.resolveFileGlobs.mockReturnValue(Promise.resolve(['C:\\windows\\test\\path\\xyz.test.ts']));

    mockLogger = mock<Logger>();

    specLocator = new SpecLocator(testFilePatterns, mockTestFileParser, mockFileHandler, mockLogger);
  });

  it('should build spec locator', () => {
    expect(specLocator).not.toBeUndefined();
    expect(specLocator).not.toBeNull();
  });

  describe('getSpecLocation method', () => {
    it('should return unix file paths', () => {
      const specLocations = specLocator.getSpecLocation(['SuiteName'], 'TestName');

      expect(specLocations.every(loc => !loc.file.includes('\\'))).toBeTruthy();
    });
  });
});
