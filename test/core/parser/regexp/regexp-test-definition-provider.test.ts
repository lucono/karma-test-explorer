import { mock, MockProxy } from 'jest-mock-extended';
import { TestDefinitionState } from '../../../../src/core/base/test-definition';
import { TestDefinitionProvider } from '../../../../src/core/base/test-definition-provider';
import { TestType } from '../../../../src/core/base/test-infos';
import { RegexpTestDefinitionProvider } from '../../../../src/core/parser/regexp/regexp-test-definition-provider';
import {
  RegexpTestFileParser,
  RegexpTestFileParserResult
} from '../../../../src/core/parser/regexp/regexp-test-file-parser';
import { TestNodeType } from '../../../../src/core/parser/regexp/test-node';
import { Logger } from '../../../../src/util/logging/logger';

describe('RegexpTestDefinitionProvider', () => {
  let mockLogger: MockProxy<Logger>;
  let mockRegexTestFileParser: MockProxy<RegexpTestFileParser>;
  let testDefinitionProvider: TestDefinitionProvider;

  beforeEach(() => {
    mockLogger = mock<Logger>();
    mockRegexTestFileParser = mock<RegexpTestFileParser>();
    testDefinitionProvider = new RegexpTestDefinitionProvider(mockRegexTestFileParser, mockLogger);
  });

  describe('when test file content having nested suites and identical descriptions is added', () => {
    const mockTestFileText = '';
    const mockTestFilePath = 'path/to/random/test/file';

    beforeEach(async () => {
      mockRegexTestFileParser.parseFileText.mockReturnValue(<RegexpTestFileParserResult>{
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
      testDefinitionProvider.addFileContent(mockTestFileText, mockTestFilePath);
    });

    describe('the get test definitions method', () => {
      it('should return the correct test definitions for the occurring identical test descriptions', () => {
        const identicalTestDefinition1 = testDefinitionProvider.getTestDefinitions(
          ['test suite 1', 'test suite 1-1', 'identical inner suite'],
          'identical inner test'
        );
        const identicalTestDefinition2 = testDefinitionProvider.getTestDefinitions(
          ['test suite 1', 'test suite 1-2', 'identical inner suite'],
          'identical inner test'
        );

        expect(identicalTestDefinition1).toEqual([
          {
            test: expect.objectContaining({
              // 'identical inner test',
              type: TestType.Test,
              state: TestDefinitionState.Default,
              disabled: false,
              file: mockTestFilePath,
              line: 4
            }),
            suite: expect.arrayContaining([
              expect.objectContaining({
                // 'test suite 1',
                type: TestType.Suite,
                state: TestDefinitionState.Default,
                disabled: false,
                file: mockTestFilePath,
                line: 1
              }),
              expect.objectContaining({
                // 'test suite 1-1',
                type: TestType.Suite,
                state: TestDefinitionState.Default,
                disabled: false,
                file: mockTestFilePath,
                line: 2
              }),
              expect.objectContaining({
                // 'identical inner suite',
                type: TestType.Suite,
                state: TestDefinitionState.Default,
                disabled: false,
                file: mockTestFilePath,
                line: 3
              })
            ])
          }
        ]);

        expect(identicalTestDefinition2).toEqual([
          {
            test: expect.objectContaining({
              // 'identical inner test',
              type: TestType.Test,
              state: TestDefinitionState.Default,
              disabled: false,
              file: mockTestFilePath,
              line: 11
            }),
            suite: expect.arrayContaining([
              expect.objectContaining({
                // 'test suite 1',
                type: TestType.Suite,
                state: TestDefinitionState.Default,
                disabled: false,
                file: mockTestFilePath,
                line: 1
              }),
              expect.objectContaining({
                // 'test suite 1-2',
                type: TestType.Suite,
                state: TestDefinitionState.Default,
                disabled: false,
                file: mockTestFilePath,
                line: 9
              }),
              expect.objectContaining({
                // 'identical inner suite',
                type: TestType.Suite,
                state: TestDefinitionState.Default,
                disabled: false,
                file: mockTestFilePath,
                line: 10
              })
            ])
          }
        ]);
      });
    });
  });
});
