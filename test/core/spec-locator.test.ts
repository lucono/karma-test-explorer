import { mock, MockProxy } from 'jest-mock-extended';
import { SpecLocator } from '../../src/core/spec-locator';
import { TestFileParser, TestSuiteFileInfo } from '../../src/core/test-file-parser';
import { FileHandler } from '../../src/util/file-handler';
import { Logger } from '../../src/util/logging/logger';

describe('SpecLocator', () => {
  const testFiles = [
    'C:\\windows\\test\\path\\abc.test.ts',
    'C:\\windows\\test\\path\\def.test.ts',
    'C:\\windows\\test\\path\\geh.test.ts'
  ];
  const testFilePatterns: string[] = ['**/*.test.ts'];

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

    specLocator = new SpecLocator(testFilePatterns, mockTestFileParser, mockFileHandler, mockLogger);
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
    it('should return unix file paths', () => {
      const specLocations = specLocator.getSpecLocation(['SuiteName']);

      expect(specLocations.every(s => !s.file.includes('\\'))).toBeTruthy();
    });
  });

  describe('isSpecLocation method', () => {
    it('should return true when matching pattern', () => {
      const result = specLocator.isSpecFile('abc.test.ts');

      expect(result).toBeTruthy();
    });

    it('should return false when not matching pattern', () => {
      const result = specLocator.isSpecFile('abc-spec.js');

      expect(result).toBeFalsy();
    });
  });

  describe('refreshFiles method', () => {
    it('should use unix file paths in cache entries', async () => {
      await specLocator.refreshFiles(testFiles);

      expect(specLocator['specFilesBySuite'].get('SuiteName')?.every(s => !s.includes('\\'))).toBeTruthy();
    });
  });
});
