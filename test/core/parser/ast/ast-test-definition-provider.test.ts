import { mock, MockProxy } from 'jest-mock-extended';
import { TestDefinitionState } from '../../../../src/core/base/test-definition';
import { TestDefinitionProvider } from '../../../../src/core/base/test-definition-provider';
import { TestType } from '../../../../src/core/base/test-infos';
import { AstTestDefinitionProvider } from '../../../../src/core/parser/ast/ast-test-definition-provider';
import { AstTestFileParser } from '../../../../src/core/parser/ast/ast-test-file-parser';
import {
  DescribedTestDefinitionInfo,
  DescribedTestDefinitionType
} from '../../../../src/core/parser/ast/described-test-definition';
import { Logger } from '../../../../src/util/logging/logger';

describe('AstTestDefinitionProvider', () => {
  let mockLogger: MockProxy<Logger>;
  let mockAstTestFileParser: MockProxy<AstTestFileParser>;
  let testDefinitionProvider: TestDefinitionProvider;

  beforeEach(() => {
    mockLogger = mock<Logger>();
    mockAstTestFileParser = mock<AstTestFileParser>();
    testDefinitionProvider = new AstTestDefinitionProvider(mockAstTestFileParser, mockLogger);
  });

  describe('when test file content having nested suites and identical descriptions is added', () => {
    const mockTestFileText = '';
    const mockTestFilePath = 'path/to/random/test/file';

    beforeEach(async () => {
      mockAstTestFileParser.parseFileText.mockReturnValue(<DescribedTestDefinitionInfo[]>[
        {
          suite: [
            {
              type: TestType.Suite,
              description: 'test suite 1',
              descriptionType: DescribedTestDefinitionType.String,
              file: mockTestFilePath,
              line: 1,
              state: TestDefinitionState.Default,
              disabled: false
            },
            {
              type: TestType.Suite,
              description: 'test suite 1-1',
              descriptionType: DescribedTestDefinitionType.String,
              file: mockTestFilePath,
              line: 2,
              state: TestDefinitionState.Default,
              disabled: false
            },
            {
              type: TestType.Suite,
              description: 'identical inner suite',
              descriptionType: DescribedTestDefinitionType.String,
              file: mockTestFilePath,
              line: 3,
              state: TestDefinitionState.Default,
              disabled: false
            }
          ],
          test: {
            type: TestType.Test,
            description: 'identical inner test',
            descriptionType: DescribedTestDefinitionType.String,
            file: mockTestFilePath,
            line: 4,
            state: TestDefinitionState.Default,
            disabled: false
          }
        },
        {
          suite: [
            {
              type: TestType.Suite,
              description: 'test suite 1',
              descriptionType: DescribedTestDefinitionType.String,
              file: mockTestFilePath,
              line: 1,
              state: TestDefinitionState.Default,
              disabled: false
            },
            {
              type: TestType.Suite,
              description: 'test suite 1-2',
              descriptionType: DescribedTestDefinitionType.String,
              file: mockTestFilePath,
              line: 9,
              state: TestDefinitionState.Default,
              disabled: false
            },
            {
              type: TestType.Suite,
              description: 'identical inner suite',
              descriptionType: DescribedTestDefinitionType.String,
              file: mockTestFilePath,
              line: 10,
              state: TestDefinitionState.Default,
              disabled: false
            }
          ],
          test: {
            type: TestType.Test,
            description: 'identical inner test',
            descriptionType: DescribedTestDefinitionType.String,
            file: mockTestFilePath,
            line: 11,
            state: TestDefinitionState.Default,
            disabled: false
          }
        }
      ]);
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
