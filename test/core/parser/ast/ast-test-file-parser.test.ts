import { ParserPlugin } from '@babel/parser';
import { mock } from 'jest-mock-extended';
import { TestDefinitionState } from '../../../../src/core/base/test-definition';
import { TestType } from '../../../../src/core/base/test-infos';
import { AstTestFileParser } from '../../../../src/core/parser/ast/ast-test-file-parser';
import { FunctionCallNodeProcessor } from '../../../../src/core/parser/ast/processors/function-call-node-processor';
import { TestDescriptionNodeProcessor } from '../../../../src/core/parser/ast/processors/test-description-node-processor';
import { TestFileParser } from '../../../../src/core/parser/test-file-parser';
import { TestDefinitionInfo } from '../../../../src/core/test-locator';
import { JasmineTestFramework } from '../../../../src/frameworks/jasmine/jasmine-test-framework';
import { MochaTestFrameworkBdd, MochaTestFrameworkTdd } from '../../../../src/frameworks/mocha/mocha-test-framework';
import { LogAppender } from '../../../../src/util/logging/log-appender';
import { LogLevel } from '../../../../src/util/logging/log-level';
import { Logger } from '../../../../src/util/logging/logger';
import { SimpleLogger } from '../../../../src/util/logging/simple-logger';
import { jasmineInterfaceKeywords, mochaBddInterfaceKeywords, mochaTddInterfaceKeywords } from '../parser-test-utils';

const fileTypeData = [
  { fileName: '/fake/test/file/path.js', fileType: '.js' },
  { fileName: '/fake/test/file/path.jsx', fileType: '.jsx' },
  { fileName: '/fake/test/file/path.ts', fileType: '.ts' },
  { fileName: '/fake/test/file/path.tsx', fileType: '.tsx' }
];

const testInterfaceData = [
  {
    testInterfaceName: 'jasmine',
    testInterface: JasmineTestFramework.getTestInterface(),
    _: jasmineInterfaceKeywords
  },
  {
    testInterfaceName: 'mocha-bdd',
    testInterface: MochaTestFrameworkBdd.getTestInterface(),
    _: mochaBddInterfaceKeywords
  },
  {
    testInterfaceName: 'mocha-tdd',
    testInterface: MochaTestFrameworkTdd.getTestInterface(),
    _: mochaTddInterfaceKeywords
  }
];

describe('AstTestFileParser', () => {
  testInterfaceData.forEach(({ testInterfaceName, testInterface, _ }) => {
    fileTypeData.forEach(({ fileName, fileType }) => {
      describe(`using the ${testInterfaceName} test interface`, () => {
        let testParser: TestFileParser<TestDefinitionInfo[]>;
        let functionCallNodeProcessor: FunctionCallNodeProcessor;
        let logger: Logger;
        let fakeTestFilePath: string;
        let parserLogs: string;

        beforeEach(() => {
          functionCallNodeProcessor = new FunctionCallNodeProcessor(
            testInterface,
            new TestDescriptionNodeProcessor(mock<Logger>()),
            mock<Logger>()
          );
          const logCapturingAppender: LogAppender = {
            append: content => (parserLogs += `${content}\n`),
            dispose: () => {} // eslint-disable-line @typescript-eslint/no-empty-function
          };
          logger = new SimpleLogger(logCapturingAppender, 'Parser Test', LogLevel.TRACE);
          testParser = new AstTestFileParser([functionCallNodeProcessor], logger, { useLenientMode: false });
          parserLogs = '';
        });

        describe(`for a '${fileType}' test file`, () => {
          beforeEach(() => {
            fakeTestFilePath = fileName;
          });

          it('correctly parses single-line comments', () => {
            const fileText = `
              // single-line comment
              ${_.describe}('test suite 1', () => {
                // single-line comment
                ${_.it}('test 1', () => {
                  const msg = 'hello';
                  // single-line comment
                });
                // single-line comment
                ${_.it}('test 2', () => {
                  const msg = 'world!';
                });
              })
              // single-line comment
            `;
            const testSuiteFileInfo = testParser.parseFileText(fileText, fakeTestFilePath);

            expect(testSuiteFileInfo).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  suite: expect.arrayContaining([
                    expect.objectContaining({
                      type: TestType.Suite,
                      description: 'test suite 1',
                      line: 2,
                      state: TestDefinitionState.Default,
                      disabled: false,
                      file: fakeTestFilePath
                    })
                  ]),
                  test: expect.objectContaining({
                    type: TestType.Test,
                    description: 'test 1',
                    line: 4,
                    state: TestDefinitionState.Default,
                    disabled: false,
                    file: fakeTestFilePath
                  })
                }),
                // ---
                expect.objectContaining({
                  suite: expect.arrayContaining([
                    expect.objectContaining({
                      type: TestType.Suite,
                      description: 'test suite 1',
                      line: 2,
                      state: TestDefinitionState.Default,
                      disabled: false,
                      file: fakeTestFilePath
                    })
                  ]),
                  test: expect.objectContaining({
                    type: TestType.Test,
                    description: 'test 2',
                    line: 9,
                    state: TestDefinitionState.Default,
                    disabled: false,
                    file: fakeTestFilePath
                  })
                })
              ])
            );
          });

          it('correctly parses multi-line comments', () => {
            const fileText = `
              /* multi-line comment with comment opening
              and closing on same lines as text */
              ${_.describe}('test suite 1', () => {
                /*
                multi-line comment
                multi-line comment
                */
                ${_.it}('test 1', () => {
                  const msg = 'hello';
                });
                /* multi-line comment on single line */
                ${_.it}('test 2', () => {
                  const msg = 'world!';
                });
              })
            `;
            const testSuiteFileInfo = testParser.parseFileText(fileText, fakeTestFilePath);

            expect(testSuiteFileInfo).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  suite: expect.arrayContaining([
                    expect.objectContaining({
                      type: TestType.Suite,
                      description: 'test suite 1',
                      line: 3,
                      state: TestDefinitionState.Default,
                      disabled: false,
                      file: fakeTestFilePath
                    })
                  ]),
                  test: expect.objectContaining({
                    type: TestType.Test,
                    description: 'test 1',
                    line: 8,
                    state: TestDefinitionState.Default,
                    disabled: false,
                    file: fakeTestFilePath
                  })
                }),
                // ---
                expect.objectContaining({
                  suite: expect.arrayContaining([
                    expect.objectContaining({
                      type: TestType.Suite,
                      description: 'test suite 1',
                      line: 3,
                      state: TestDefinitionState.Default,
                      disabled: false,
                      file: fakeTestFilePath
                    })
                  ]),
                  test: expect.objectContaining({
                    type: TestType.Test,
                    description: 'test 2',
                    line: 12,
                    state: TestDefinitionState.Default,
                    disabled: false,
                    file: fakeTestFilePath
                  })
                })
              ])
            );
          });

          it('correctly parses commented out tests', () => {
            const fileText = `
              ${_.describe}('test suite 1', () => {
                /*
                ${_.it}('commented out test 1') {
                  test contents
                }
                */
                ${_.it}('test 1', () => {
                  // ${_.it}('commented out test 2') {
                  //   test contents
                  // }
                });
              })
            `;
            const testSuiteFileInfo = testParser.parseFileText(fileText, fakeTestFilePath);

            expect(testSuiteFileInfo).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  suite: expect.arrayContaining([
                    expect.objectContaining({
                      type: TestType.Suite,
                      description: 'test suite 1',
                      line: 1,
                      state: TestDefinitionState.Default,
                      disabled: false,
                      file: fakeTestFilePath
                    })
                  ]),
                  test: expect.objectContaining({
                    type: TestType.Test,
                    description: 'test 1',
                    line: 7,
                    state: TestDefinitionState.Default,
                    disabled: false,
                    file: fakeTestFilePath
                  })
                })
              ])
            );
          });

          it('correctly parses a combination of various kinds of comments in the same file', () => {
            const fileText = `
              ${_.describe}('test suite 1', () => {
                ${_.it}('test 1', () => {
                  // single-line comments
                  /*
                  multi-line comment
                  multi-line comment
                  */
                });
                /*
                ${_.it}('commented out test 1') {
                  // test contents
                });
                */
              })
            `;
            const testSuiteFileInfo = testParser.parseFileText(fileText, fakeTestFilePath);

            expect(testSuiteFileInfo).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  suite: expect.arrayContaining([
                    expect.objectContaining({
                      type: TestType.Suite,
                      description: 'test suite 1',
                      line: 1,
                      state: TestDefinitionState.Default,
                      disabled: false,
                      file: fakeTestFilePath
                    })
                  ]),
                  test: expect.objectContaining({
                    type: TestType.Test,
                    description: 'test 1',
                    line: 2,
                    state: TestDefinitionState.Default,
                    disabled: false,
                    file: fakeTestFilePath
                  })
                })
              ])
            );
          });

          it('correctly parses arrow function tests', () => {
            const fileText = `
              ${_.describe}('test suite 1', () => {
                ${_.it}('test 1', () => {
                  // test contents
                });
              })
            `;
            const testSuiteFileInfo = testParser.parseFileText(fileText, fakeTestFilePath);

            expect(testSuiteFileInfo).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  suite: expect.arrayContaining([
                    expect.objectContaining({
                      type: TestType.Suite,
                      description: 'test suite 1',
                      line: 1,
                      state: TestDefinitionState.Default,
                      disabled: false,
                      file: fakeTestFilePath
                    })
                  ]),
                  test: expect.objectContaining({
                    type: TestType.Test,
                    description: 'test 1',
                    line: 2,
                    state: TestDefinitionState.Default,
                    disabled: false,
                    file: fakeTestFilePath
                  })
                })
              ])
            );
          });

          it('correctly parses non-arrow function tests', () => {
            const fileText = `
              ${_.describe}('test suite 1', function() {
                ${_.it}('test 1', function() {
                  // test contents
                });
              })
            `;
            const testSuiteFileInfo = testParser.parseFileText(fileText, fakeTestFilePath);

            expect(testSuiteFileInfo).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  suite: expect.arrayContaining([
                    expect.objectContaining({
                      type: TestType.Suite,
                      description: 'test suite 1',
                      line: 1,
                      state: TestDefinitionState.Default,
                      disabled: false,
                      file: fakeTestFilePath
                    })
                  ]),
                  test: expect.objectContaining({
                    type: TestType.Test,
                    description: 'test 1',
                    line: 2,
                    state: TestDefinitionState.Default,
                    disabled: false,
                    file: fakeTestFilePath
                  })
                })
              ])
            );
          });

          it('correctly parses async arrow function tests', () => {
            const fileText = `
              ${_.describe}('test suite 1', async () => {
                ${_.it}('test 1', async () => {
                  // test contents
                });
              })
            `;
            const testSuiteFileInfo = testParser.parseFileText(fileText, fakeTestFilePath);

            expect(testSuiteFileInfo).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  suite: expect.arrayContaining([
                    expect.objectContaining({
                      type: TestType.Suite,
                      description: 'test suite 1',
                      line: 1,
                      state: TestDefinitionState.Default,
                      disabled: false,
                      file: fakeTestFilePath
                    })
                  ]),
                  test: expect.objectContaining({
                    type: TestType.Test,
                    description: 'test 1',
                    line: 2,
                    state: TestDefinitionState.Default,
                    disabled: false,
                    file: fakeTestFilePath
                  })
                })
              ])
            );
          });

          it('correctly parses async non-arrow function tests', () => {
            const fileText = `
              ${_.describe}('test suite 1', async function() {
                ${_.it}('test 1', async function() {
                  // test contents
                });
              })
            `;
            const testSuiteFileInfo = testParser.parseFileText(fileText, fakeTestFilePath);

            expect(testSuiteFileInfo).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  suite: expect.arrayContaining([
                    expect.objectContaining({
                      type: TestType.Suite,
                      description: 'test suite 1',
                      line: 1,
                      state: TestDefinitionState.Default,
                      disabled: false,
                      file: fakeTestFilePath
                    })
                  ]),
                  test: expect.objectContaining({
                    type: TestType.Test,
                    description: 'test 1',
                    line: 2,
                    state: TestDefinitionState.Default,
                    disabled: false,
                    file: fakeTestFilePath
                  })
                })
              ])
            );
          });

          it('correctly parses tests with description on following line', () => {
            const fileText = `
              ${_.describe}(
                'test suite 1', () => {
                ${_.it}(
                  'test 1', () => {
                  // test contents
                });
              })
            `;
            const testSuiteFileInfo = testParser.parseFileText(fileText, fakeTestFilePath);

            expect(testSuiteFileInfo).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  suite: expect.arrayContaining([
                    expect.objectContaining({
                      type: TestType.Suite,
                      description: 'test suite 1',
                      line: 1,
                      state: TestDefinitionState.Default,
                      disabled: false,
                      file: fakeTestFilePath
                    })
                  ]),
                  test: expect.objectContaining({
                    type: TestType.Test,
                    description: 'test 1',
                    line: 3,
                    state: TestDefinitionState.Default,
                    disabled: false,
                    file: fakeTestFilePath
                  })
                })
              ])
            );
          });

          it('correctly parses test description containing curly brace', () => {
            const fileText = `
              ${_.describe}('test { suite 1', () => {
                ${_.it}('test } 1', () => {
                  // test contents
                });
              })
            `;
            const testSuiteFileInfo = testParser.parseFileText(fileText, fakeTestFilePath);

            expect(testSuiteFileInfo).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  suite: expect.arrayContaining([
                    expect.objectContaining({
                      type: TestType.Suite,
                      description: 'test { suite 1',
                      line: 1,
                      state: TestDefinitionState.Default,
                      disabled: false,
                      file: fakeTestFilePath
                    })
                  ]),
                  test: expect.objectContaining({
                    type: TestType.Test,
                    description: 'test } 1',
                    line: 2,
                    state: TestDefinitionState.Default,
                    disabled: false,
                    file: fakeTestFilePath
                  })
                })
              ])
            );
          });

          it('correctly parses test description containing parentheses', () => {
            const fileText = `
              ${_.describe}('test ( suite 1', () => {
                ${_.it}('test ) 1', () => {
                  // test contents
                });
              })
            `;
            const testSuiteFileInfo = testParser.parseFileText(fileText, fakeTestFilePath);

            expect(testSuiteFileInfo).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  suite: expect.arrayContaining([
                    expect.objectContaining({
                      type: TestType.Suite,
                      description: 'test ( suite 1',
                      line: 1,
                      state: TestDefinitionState.Default,
                      disabled: false,
                      file: fakeTestFilePath
                    })
                  ]),
                  test: expect.objectContaining({
                    type: TestType.Test,
                    description: 'test ) 1',
                    line: 2,
                    state: TestDefinitionState.Default,
                    disabled: false,
                    file: fakeTestFilePath
                  })
                })
              ])
            );
          });

          it('correctly parses single-line test format', () => {
            const fileText = `
              ${_.describe}('test suite 1', () => {
                ${_.it}('test 1', () => { /* test contents */ });
              })
            `;
            const testSuiteFileInfo = testParser.parseFileText(fileText, fakeTestFilePath);

            expect(testSuiteFileInfo).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  suite: expect.arrayContaining([
                    expect.objectContaining({
                      type: TestType.Suite,
                      description: 'test suite 1',
                      line: 1,
                      state: TestDefinitionState.Default,
                      disabled: false,
                      file: fakeTestFilePath
                    })
                  ]),
                  test: expect.objectContaining({
                    type: TestType.Test,
                    description: 'test 1',
                    line: 2,
                    state: TestDefinitionState.Default,
                    disabled: false,
                    file: fakeTestFilePath
                  })
                })
              ])
            );
          });

          it('correctly parses tests defined starting on the first line of the file', () => {
            const fileText =
              // First line begins below
              `${_.describe}('test suite 1', () => {
                  ${_.it}('test 1', () => { /* test contents */ });
                })
              `;
            const testSuiteFileInfo = testParser.parseFileText(fileText, fakeTestFilePath);

            expect(testSuiteFileInfo).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  suite: expect.arrayContaining([
                    expect.objectContaining({
                      type: TestType.Suite,
                      description: 'test suite 1',
                      line: 0,
                      state: TestDefinitionState.Default,
                      disabled: false,
                      file: fakeTestFilePath
                    })
                  ]),
                  test: expect.objectContaining({
                    type: TestType.Test,
                    description: 'test 1',
                    line: 1,
                    state: TestDefinitionState.Default,
                    disabled: false,
                    file: fakeTestFilePath
                  })
                })
              ])
            );
          });

          it('correctly parses nested test suites with no identical test descriptions', () => {
            const fileText = `
              ${_.describe}('test suite 1', () => {
                ${_.describe}('test suite 2', () => {
                  ${_.describe}('test suite 3', () => {
                    ${_.it}('test 1', () => {
                        // test contents
                    });
                  });
                });
              });
            `;
            const testSuiteFileInfo = testParser.parseFileText(fileText, fakeTestFilePath);

            expect(testSuiteFileInfo).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  suite: expect.arrayContaining([
                    expect.objectContaining({
                      type: TestType.Suite,
                      description: 'test suite 1',
                      line: 1,
                      state: TestDefinitionState.Default,
                      disabled: false,
                      file: fakeTestFilePath
                    }),
                    expect.objectContaining({
                      type: TestType.Suite,
                      description: 'test suite 2',
                      line: 2,
                      state: TestDefinitionState.Default,
                      disabled: false,
                      file: fakeTestFilePath
                    }),
                    expect.objectContaining({
                      type: TestType.Suite,
                      description: 'test suite 3',
                      line: 3,
                      state: TestDefinitionState.Default,
                      disabled: false,
                      file: fakeTestFilePath
                    })
                  ]),
                  test: expect.objectContaining({
                    type: TestType.Test,
                    description: 'test 1',
                    line: 4,
                    state: TestDefinitionState.Default,
                    disabled: false,
                    file: fakeTestFilePath
                  })
                })
              ])
            );
          });

          it('correctly parses nested test suites with one or more identical test descriptions', () => {
            const fileText = `
              ${_.describe}('test suite 1', function () {
                ${_.describe}('test suite 1-1', function () {
                  ${_.describe}('identical inner suite', function () {
                    ${_.it}('identical inner test', function () {
                      // test contents
                    })
                  })
                })
                ${_.describe}('test suite 1-2', function () {
                  ${_.describe}('identical inner suite', function () {
                    ${_.it}('identical inner test', function () {
                      // test contents
                    })
                  })
                })
              })
            `;
            const testSuiteFileInfo = testParser.parseFileText(fileText, fakeTestFilePath);

            expect(testSuiteFileInfo).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  suite: expect.arrayContaining([
                    expect.objectContaining({
                      type: TestType.Suite,
                      description: 'test suite 1',
                      line: 1,
                      state: TestDefinitionState.Default,
                      disabled: false,
                      file: fakeTestFilePath
                    }),
                    expect.objectContaining({
                      type: TestType.Suite,
                      description: 'test suite 1-1',
                      line: 2,
                      state: TestDefinitionState.Default,
                      disabled: false,
                      file: fakeTestFilePath
                    }),
                    expect.objectContaining({
                      type: TestType.Suite,
                      description: 'identical inner suite',
                      line: 3,
                      state: TestDefinitionState.Default,
                      disabled: false,
                      file: fakeTestFilePath
                    })
                  ]),
                  test: expect.objectContaining({
                    type: TestType.Test,
                    description: 'identical inner test',
                    line: 4,
                    state: TestDefinitionState.Default,
                    disabled: false,
                    file: fakeTestFilePath
                  })
                }),
                // ---
                expect.objectContaining({
                  suite: expect.arrayContaining([
                    expect.objectContaining({
                      type: TestType.Suite,
                      description: 'test suite 1',
                      line: 1,
                      state: TestDefinitionState.Default,
                      disabled: false,
                      file: fakeTestFilePath
                    }),
                    expect.objectContaining({
                      type: TestType.Suite,
                      description: 'test suite 1-2',
                      line: 9,
                      state: TestDefinitionState.Default,
                      disabled: false,
                      file: fakeTestFilePath
                    }),
                    expect.objectContaining({
                      type: TestType.Suite,
                      description: 'identical inner suite',
                      line: 10,
                      state: TestDefinitionState.Default,
                      disabled: false,
                      file: fakeTestFilePath
                    })
                  ]),
                  test: expect.objectContaining({
                    type: TestType.Test,
                    description: 'identical inner test',
                    line: 11,
                    state: TestDefinitionState.Default,
                    disabled: false,
                    file: fakeTestFilePath
                  })
                })
              ])
            );
          });

          it('correctly parses file with multiple top level suites', () => {
            const fileText = `
              ${_.describe}('test suite 1', () => {
                ${_.it}('test 1', () => {
                  // test contents
                })
              });
              ${_.describe}('test suite 2', () => {
                ${_.it}('test 2', () => {
                  // test contents
                })
              });
            `;
            const testSuiteFileInfo = testParser.parseFileText(fileText, fakeTestFilePath);

            expect(testSuiteFileInfo).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  suite: expect.arrayContaining([
                    expect.objectContaining({
                      type: TestType.Suite,
                      description: 'test suite 1',
                      line: 1,
                      state: TestDefinitionState.Default,
                      disabled: false,
                      file: fakeTestFilePath
                    })
                  ]),
                  test: expect.objectContaining({
                    type: TestType.Test,
                    description: 'test 1',
                    line: 2,
                    state: TestDefinitionState.Default,
                    disabled: false,
                    file: fakeTestFilePath
                  })
                }),
                // ---
                expect.objectContaining({
                  suite: expect.arrayContaining([
                    expect.objectContaining({
                      type: TestType.Suite,
                      description: 'test suite 2',
                      line: 6,
                      state: TestDefinitionState.Default,
                      disabled: false,
                      file: fakeTestFilePath
                    })
                  ]),
                  test: expect.objectContaining({
                    type: TestType.Test,
                    description: 'test 2',
                    line: 7,
                    state: TestDefinitionState.Default,
                    disabled: false,
                    file: fakeTestFilePath
                  })
                })
              ])
            );
          });

          it('correctly parses focused suites', () => {
            const fileText = `
              ${_.fdescribe}('test suite 1', () => {
                ${_.it}('test 1', () => {
                  // test contents
                });
              })
            `;
            const testSuiteFileInfo = testParser.parseFileText(fileText, fakeTestFilePath);

            expect(testSuiteFileInfo).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  suite: expect.arrayContaining([
                    expect.objectContaining({
                      type: TestType.Suite,
                      description: 'test suite 1',
                      line: 1,
                      state: TestDefinitionState.Focused,
                      disabled: false,
                      file: fakeTestFilePath
                    })
                  ]),
                  test: expect.objectContaining({
                    type: TestType.Test,
                    description: 'test 1',
                    line: 2,
                    state: TestDefinitionState.Default,
                    disabled: false,
                    file: fakeTestFilePath
                  })
                })
              ])
            );
          });

          it('correctly parses focused tests', () => {
            const fileText = `
              ${_.describe}('test suite 1', () => {
                ${_.fit}('test 1', () => {
                  // test contents
                });
              })
            `;
            const testSuiteFileInfo = testParser.parseFileText(fileText, fakeTestFilePath);

            expect(testSuiteFileInfo).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  suite: expect.arrayContaining([
                    expect.objectContaining({
                      type: TestType.Suite,
                      description: 'test suite 1',
                      line: 1,
                      state: TestDefinitionState.Default,
                      disabled: false,
                      file: fakeTestFilePath
                    })
                  ]),
                  test: expect.objectContaining({
                    type: TestType.Test,
                    description: 'test 1',
                    line: 2,
                    state: TestDefinitionState.Focused,
                    disabled: false,
                    file: fakeTestFilePath
                  })
                })
              ])
            );
          });

          it('correctly parses disabled suites', () => {
            const fileText = `
              ${_.xdescribe}('test suite 1', () => {
                ${_.it}('test 1', () => {
                  // test contents
                });
              })
            `;
            const testSuiteFileInfo = testParser.parseFileText(fileText, fakeTestFilePath);

            expect(testSuiteFileInfo).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  suite: expect.arrayContaining([
                    expect.objectContaining({
                      type: TestType.Suite,
                      description: 'test suite 1',
                      line: 1,
                      state: TestDefinitionState.Disabled,
                      disabled: true,
                      file: fakeTestFilePath
                    })
                  ]),
                  test: expect.objectContaining({
                    type: TestType.Test,
                    description: 'test 1',
                    line: 2,
                    state: TestDefinitionState.Default,
                    disabled: true,
                    file: fakeTestFilePath
                  })
                })
              ])
            );
          });

          it('correctly parses disabled tests', () => {
            const fileText = `
              ${_.describe}('test suite 1', () => {
                ${_.xit}('test 1', () => {
                  // test contents
                });
              })
            `;
            const testSuiteFileInfo = testParser.parseFileText(fileText, fakeTestFilePath);

            expect(testSuiteFileInfo).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  suite: expect.arrayContaining([
                    expect.objectContaining({
                      type: TestType.Suite,
                      description: 'test suite 1',
                      line: 1,
                      state: TestDefinitionState.Default,
                      disabled: false,
                      file: fakeTestFilePath
                    })
                  ]),
                  test: expect.objectContaining({
                    type: TestType.Test,
                    description: 'test 1',
                    line: 2,
                    state: TestDefinitionState.Disabled,
                    disabled: true,
                    file: fakeTestFilePath
                  })
                })
              ])
            );
          });

          it('correctly parses javascript static keyword', () => {
            const fileText = `
              ${_.describe}('test suite 1', () => {
                ${_.it}('test 1', () => {
                  public static value: string = 'hi';
                });
              })
            `;
            const testSuiteFileInfo = testParser.parseFileText(fileText, fakeTestFilePath);

            expect(testSuiteFileInfo).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  suite: expect.arrayContaining([
                    expect.objectContaining({
                      type: TestType.Suite,
                      description: 'test suite 1',
                      line: 1,
                      state: TestDefinitionState.Default,
                      disabled: false,
                      file: fakeTestFilePath
                    })
                  ]),
                  test: expect.objectContaining({
                    type: TestType.Test,
                    description: 'test 1',
                    line: 2,
                    state: TestDefinitionState.Default,
                    disabled: false,
                    file: fakeTestFilePath
                  })
                })
              ])
            );
          });

          it('correctly parses JavaScript decorators', () => {
            const fileText = `
              ${_.describe}('test suite 1', () => {
                ${_.it}('test 1', () => {
                  @fakeClassDecorator
                  class RandomClass {
                    @fakeMethodDecorator({prop1: 'prop1_value', prop2: 'prop2_value'})
                    randomMethod() {
                      // method contents
                    }
                  }
                });
              })
              @fakeDecoratorBeforeExport export class RandomExportedClass1 {}
              export @fakeDecoratorAfterExport class RandomExportedClass2 {}
            `;
            const testSuiteFileInfo = testParser.parseFileText(fileText, fakeTestFilePath);

            expect(testSuiteFileInfo).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  suite: expect.arrayContaining([
                    expect.objectContaining({
                      type: TestType.Suite,
                      description: 'test suite 1',
                      line: 1,
                      state: TestDefinitionState.Default,
                      disabled: false,
                      file: fakeTestFilePath
                    })
                  ]),
                  test: expect.objectContaining({
                    type: TestType.Test,
                    description: 'test 1',
                    line: 2,
                    state: TestDefinitionState.Default,
                    disabled: false,
                    file: fakeTestFilePath
                  })
                })
              ])
            );
          });

          it('correctly parses typescript `as` type casts', () => {
            const fileText = `
              ${_.describe}('test suite 1', () => {
                ${_.it}('test 1', () => {
                  const with_as_type_cast = 5 as string;
                });
              })
            `;
            const testSuiteFileInfo = testParser.parseFileText(fileText, fakeTestFilePath);

            expect(testSuiteFileInfo).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  suite: expect.arrayContaining([
                    expect.objectContaining({
                      type: TestType.Suite,
                      description: 'test suite 1',
                      line: 1,
                      state: TestDefinitionState.Default,
                      disabled: false,
                      file: fakeTestFilePath
                    })
                  ]),
                  test: expect.objectContaining({
                    type: TestType.Test,
                    description: 'test 1',
                    line: 2,
                    state: TestDefinitionState.Default,
                    disabled: false,
                    file: fakeTestFilePath
                  })
                })
              ])
            );
          });

          ['decorators'].forEach(plugin => {
            it(`applies the '${plugin}' parser plugin when parsing the file`, () => {
              const fileText = `
                ${_.describe}('test suite 1', () => {
                  ${_.it}('test 1', () => {
                    // test contents
                  });
                })
              `;
              testParser.parseFileText(fileText, fakeTestFilePath);

              const pluginLogMatcher = new RegExp(
                `Parsing file '${fakeTestFilePath}' using parser plugins: [^\\n]*"${plugin}"[^\\n]*($|\\n)`
              );
              const fileWasParsedWithTypeScriptPlugin = parserLogs.search(pluginLogMatcher) !== -1;

              expect(fileWasParsedWithTypeScriptPlugin).toBe(true);
              expect(parserLogs.includes(`Error parsing file '${fakeTestFilePath}'`)).toBe(false);
            });
          });

          if (['.ts', '.tsx'].includes(fileType)) {
            it('applies the TypeScript parser plugin when parsing the file', () => {
              const fileText = `
                ${_.describe}('test suite 1', () => {
                  ${_.it}('test 1', () => {
                    // test contents
                  });
                })
              `;
              testParser.parseFileText(fileText, fakeTestFilePath);

              const pluginLogMatcher = new RegExp(
                `Parsing file '${fakeTestFilePath}' using parser plugins: [^\\n]*"typescript"[^\\n]*($|\\n)`
              );
              const fileWasParsedWithTypeScriptPlugin = parserLogs.search(pluginLogMatcher) !== -1;

              expect(fileWasParsedWithTypeScriptPlugin).toBe(true);
              expect(parserLogs.includes(`Error parsing file '${fakeTestFilePath}'`)).toBe(false);
            });

            it('correctly parses typescript type annotations', () => {
              const fileText = `
                ${_.describe}('test suite 1', () => {
                  ${_.it}('test 1', () => {
                    const with_type_annotation: string = 'hi';
                  });
                })
              `;
              const testSuiteFileInfo = testParser.parseFileText(fileText, fakeTestFilePath);

              expect(testSuiteFileInfo).toEqual(
                expect.arrayContaining([
                  expect.objectContaining({
                    suite: expect.arrayContaining([
                      expect.objectContaining({
                        type: TestType.Suite,
                        description: 'test suite 1',
                        line: 1,
                        state: TestDefinitionState.Default,
                        disabled: false,
                        file: fakeTestFilePath
                      })
                    ]),
                    test: expect.objectContaining({
                      type: TestType.Test,
                      description: 'test 1',
                      line: 2,
                      state: TestDefinitionState.Default,
                      disabled: false,
                      file: fakeTestFilePath
                    })
                  })
                ])
              );
            });
          }

          if (['.js', '.jsx', '.tsx'].includes(fileType)) {
            it('applies the JSX parser plugin when parsing the file', () => {
              const fileText = `
                ${_.describe}('test suite 1', () => {
                  ${_.it}('test 1', () => {
                    // test contents
                  });
                })
              `;
              testParser.parseFileText(fileText, fakeTestFilePath);

              const pluginLogMatcher = new RegExp(
                `Parsing file '${fakeTestFilePath}' using parser plugins: [^\\n]*"jsx"[^\\n]*($|\\n)`
              );
              const fileWasParsedWithJsxPlugin = parserLogs.search(pluginLogMatcher) !== -1;

              expect(fileWasParsedWithJsxPlugin).toBe(true);
              expect(parserLogs.includes(`Error parsing file '${fakeTestFilePath}'`)).toBe(false);
            });

            it('correctly parses jsx content', () => {
              const fileText = `
                ${_.describe}('test suite 1', () => {
                  ${_.it}('test 1', () => {
                    render(<Hello />, container);
                  });
                })
              `;
              const testSuiteFileInfo = testParser.parseFileText(fileText, fakeTestFilePath);

              expect(testSuiteFileInfo).toEqual(
                expect.arrayContaining([
                  expect.objectContaining({
                    suite: expect.arrayContaining([
                      expect.objectContaining({
                        type: TestType.Suite,
                        description: 'test suite 1',
                        line: 1,
                        state: TestDefinitionState.Default,
                        disabled: false,
                        file: fakeTestFilePath
                      })
                    ]),
                    test: expect.objectContaining({
                      type: TestType.Test,
                      description: 'test 1',
                      line: 2,
                      state: TestDefinitionState.Default,
                      disabled: false,
                      file: fakeTestFilePath
                    })
                  })
                ])
              );
            });
          }

          if (['.js', '.jsx'].includes(fileType)) {
            it('does not apply the TypeScript parser plugin when parsing the file', () => {
              const fileText = `
                ${_.describe}('test suite 1', () => {
                  ${_.it}('test 1', () => {
                    // test contents
                  });
                })
              `;
              testParser.parseFileText(fileText, fakeTestFilePath);

              const pluginLogMatcher = new RegExp(
                `Parsing file '${fakeTestFilePath}' using parser plugins: [^\\n]*"typescript"[^\\n]*($|\\n)`
              );
              const fileWasParsedWithTypeScriptPlugin = parserLogs.search(pluginLogMatcher) !== -1;

              expect(fileWasParsedWithTypeScriptPlugin).toBe(false);
              expect(parserLogs.includes(`Error parsing file '${fakeTestFilePath}'`)).toBe(false);
            });
          }

          if (['.ts'].includes(fileType)) {
            it('does not apply the JSX parser plugin when parsing the file', () => {
              const fileText = `
                ${_.describe}('test suite 1', () => {
                  ${_.it}('test 1', () => {
                    // test contents
                  });
                })
              `;
              testParser.parseFileText(fileText, fakeTestFilePath);

              const pluginLogMatcher = new RegExp(
                `Parsing file '${fakeTestFilePath}' using parser plugins: [^\\n]*"jsx"[^\\n]*($|\\n)`
              );
              const fileWasParsedWithJsxPlugin = parserLogs.search(pluginLogMatcher) !== -1;

              expect(fileWasParsedWithJsxPlugin).toBe(false);
              expect(parserLogs.includes(`Error parsing file '${fakeTestFilePath}'`)).toBe(false);
            });

            it('correctly parses typescript angle bracket type casts', () => {
              const fileText = `
                ${_.describe}('test suite 1', () => {
                  ${_.it}('test 1', () => {
                    const with_angle_bracket_type_cast = <string>5;
                    const obj_prop_with_angle_bracket_type_cast = {
                      prop1: 'hi',
                      prop2: <number>'5'
                    };
                  });
                })
              `;
              const testSuiteFileInfo = testParser.parseFileText(fileText, fakeTestFilePath);

              expect(testSuiteFileInfo).toEqual(
                expect.arrayContaining([
                  expect.objectContaining({
                    suite: expect.arrayContaining([
                      expect.objectContaining({
                        type: TestType.Suite,
                        description: 'test suite 1',
                        line: 1,
                        state: TestDefinitionState.Default,
                        disabled: false,
                        file: fakeTestFilePath
                      })
                    ]),
                    test: expect.objectContaining({
                      type: TestType.Test,
                      description: 'test 1',
                      line: 2,
                      state: TestDefinitionState.Default,
                      disabled: false,
                      file: fakeTestFilePath
                    })
                  })
                ])
              );
            });
          }

          describe('using lenient parsing mode', () => {
            beforeEach(() => {
              testParser = new AstTestFileParser([functionCallNodeProcessor], logger, { useLenientMode: true });
            });

            if (['.js', '.jsx'].includes(fileType)) {
              describe('when there is TypeScript content in the non-TypeScript file type', () => {
                let fileText: string;

                beforeEach(() => {
                  fileText = `
                    ${_.describe}('test suite 1', () => {
                      ${_.it}('test 1', () => {
                        const with_type_annotation: string = 'hi';
                      });
                    })
                  `;
                });

                it(`experiences a failure parsing the file`, () => {
                  testParser.parseFileText(fileText, fakeTestFilePath);
                  expect(parserLogs.includes(`Error parsing file '${fakeTestFilePath}'`)).toBe(true);
                });

                it(`applies the TypeScript plugin to parse the TypeScript content in the file`, () => {
                  testParser.parseFileText(fileText, fakeTestFilePath);

                  const pluginLogMatcher = new RegExp(
                    `Parsing file '${fakeTestFilePath}' using parser plugins: [^\\n]*"typescript"[^\\n]*($|\\n)`
                  );
                  const fileWasParsedWithTypeScriptPlugin = parserLogs.search(pluginLogMatcher) !== -1;
                  expect(fileWasParsedWithTypeScriptPlugin).toBe(true);
                });

                it('successfully parses the file', () => {
                  const testSuiteFileInfo = testParser.parseFileText(fileText, fakeTestFilePath);

                  expect(testSuiteFileInfo).toEqual(
                    expect.arrayContaining([
                      expect.objectContaining({
                        suite: expect.arrayContaining([
                          expect.objectContaining({
                            type: TestType.Suite,
                            description: 'test suite 1',
                            line: 1,
                            state: TestDefinitionState.Default,
                            disabled: false,
                            file: fakeTestFilePath
                          })
                        ]),
                        test: expect.objectContaining({
                          type: TestType.Test,
                          description: 'test 1',
                          line: 2,
                          state: TestDefinitionState.Default,
                          disabled: false,
                          file: fakeTestFilePath
                        })
                      })
                    ])
                  );
                });
              });
            }

            if (['.ts'].includes(fileType)) {
              describe('when there is JSX content in the non-JSX file type', () => {
                let fileText: string;

                beforeEach(() => {
                  fileText = `
                    ${_.describe}('test suite 1', () => {
                      ${_.it}('test 1', () => {
                        render(<Hello />, container);
                      });
                    })
                  `;
                });

                it(`experiences a failure parsing the file`, () => {
                  testParser.parseFileText(fileText, fakeTestFilePath);
                  expect(parserLogs.includes(`Error parsing file '${fakeTestFilePath}'`)).toBe(true);
                });

                it(`applies the JSX plugin to parse the JSX content in the file`, () => {
                  testParser.parseFileText(fileText, fakeTestFilePath);

                  const pluginLogMatcher = new RegExp(
                    `Parsing file '${fakeTestFilePath}' using parser plugins: [^\\n]*"jsx"[^\\n]*($|\\n)`
                  );
                  const fileWasParsedWithJsxPlugin = parserLogs.search(pluginLogMatcher) !== -1;
                  expect(fileWasParsedWithJsxPlugin).toBe(true);
                });

                it('successfully parses the file', () => {
                  const testSuiteFileInfo = testParser.parseFileText(fileText, fakeTestFilePath);

                  expect(testSuiteFileInfo).toEqual(
                    expect.arrayContaining([
                      expect.objectContaining({
                        suite: expect.arrayContaining([
                          expect.objectContaining({
                            type: TestType.Suite,
                            description: 'test suite 1',
                            line: 1,
                            state: TestDefinitionState.Default,
                            disabled: false,
                            file: fakeTestFilePath
                          })
                        ]),
                        test: expect.objectContaining({
                          type: TestType.Test,
                          description: 'test 1',
                          line: 2,
                          state: TestDefinitionState.Default,
                          disabled: false,
                          file: fakeTestFilePath
                        })
                      })
                    ])
                  );
                });
              });
            }

            if (['.tsx'].includes(fileType)) {
              it.todo('TODO');
            }
          });

          describe('when enabled parser plugins is undefined', () => {
            beforeEach(() => {
              testParser = new AstTestFileParser([functionCallNodeProcessor], logger, {
                useLenientMode: true,
                enabledParserPlugins: undefined
              });
            });

            it(`applies default plugins to parse the content`, () => {
              const fileText = `fakeKeyWord var = should fail to parse;`;
              try {
                testParser.parseFileText(fileText, fakeTestFilePath);
              } catch (error) {
                /* Do nothing */
              }

              const typescriptPluginLogMatcher = new RegExp(
                `Parsing file '${fakeTestFilePath}' using parser plugins: [^\\n]*"typescript"[^\\n]*($|\\n)`
              );
              const jsxPluginLogMatcher = new RegExp(
                `Parsing file '${fakeTestFilePath}' using parser plugins: [^\\n]*"jsx"[^\\n]*($|\\n)`
              );
              const decoratorsPluginLogMatcher = new RegExp(
                `Parsing file '${fakeTestFilePath}' using parser plugins: [^\\n]*"decorators"[^\\n]*($|\\n)`
              );
              const fileWasParsedWithTypeScriptPlugin = parserLogs.search(typescriptPluginLogMatcher) !== -1;
              const fileWasParsedWithJsxPlugin = parserLogs.search(jsxPluginLogMatcher) !== -1;
              const fileWasParsedWithDecoratorsPlugin = parserLogs.search(decoratorsPluginLogMatcher) !== -1;

              expect(fileWasParsedWithTypeScriptPlugin).toBe(true);
              expect(fileWasParsedWithJsxPlugin).toBe(true);
              expect(fileWasParsedWithDecoratorsPlugin).toBe(true);
            });
          });

          describe('when enabled parser plugins is an empty list', () => {
            beforeEach(() => {
              testParser = new AstTestFileParser([functionCallNodeProcessor], logger, {
                useLenientMode: false,
                enabledParserPlugins: []
              });
            });

            it(`doesn't apply any plugins to parse the content`, () => {
              const fileText = `fakeKeyWord var = should fail to parse;`;
              try {
                testParser.parseFileText(fileText, fakeTestFilePath);
              } catch (error) {
                /* Do nothing */
              }

              const anyPluginLogMatcher = new RegExp(
                `Parsing file '${fakeTestFilePath}' using parser plugins: \\[[^\\]]`
              );
              const fileWasParsedWithAnyPlugin = parserLogs.search(anyPluginLogMatcher) !== -1;
              expect(fileWasParsedWithAnyPlugin).toBe(false);
            });
          });

          describe('when enabled parser plugins is a non-empty list', () => {
            let specifiedPlugin: ParserPlugin;

            beforeEach(() => {
              specifiedPlugin = 'decimal';
              testParser = new AstTestFileParser([functionCallNodeProcessor], logger, {
                useLenientMode: true,
                enabledParserPlugins: [specifiedPlugin]
              });
            });

            it(`applies only the specified plugins to parse the content`, () => {
              const fileText = `fakeKeyWord var = should fail to parse;`;
              try {
                testParser.parseFileText(fileText, fakeTestFilePath);
              } catch (error) {
                /* Do nothing */
              }

              const specifiedPluginLogMatcher = new RegExp(
                `Parsing file '${fakeTestFilePath}' using parser plugins: [^\\n]*"${specifiedPlugin}"[^\\n]*($|\\n)`,
                'g'
              );
              const anyPluginLogMatcher = new RegExp(
                `Parsing file '${fakeTestFilePath}' using parser plugins: \\[[^\\]]`,
                'g'
              );
              const parseCountWithSpecifiedPlugin = parserLogs.match(specifiedPluginLogMatcher)?.length ?? 0;
              const parseCountWithAnyPlugin = parserLogs.match(anyPluginLogMatcher)?.length ?? 0;

              expect(parseCountWithSpecifiedPlugin).not.toEqual(0);
              expect(parseCountWithSpecifiedPlugin).toEqual(parseCountWithAnyPlugin);
            });
          });
        });
      });
    });
  });
});
