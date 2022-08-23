import { mock, MockProxy } from 'jest-mock-extended';
import { TestDefinitionState } from '../../../../src/core/base/test-definition';
import { TestType } from '../../../../src/core/base/test-infos';
import { AstTestFileParser } from '../../../../src/core/parser/ast/ast-test-file-parser';
import { TestAndSuiteNodeProcessor } from '../../../../src/core/parser/ast/processors/test-and-suite-node-processor';
import { TestDescriptionNodeProcessor } from '../../../../src/core/parser/ast/processors/test-description-node-processor';
import { TestFileParser } from '../../../../src/core/parser/test-file-parser';
import { TestDefinitionInfo } from '../../../../src/core/test-locator';
import { JasmineTestFramework } from '../../../../src/frameworks/jasmine/jasmine-test-framework';
import { MochaTestFrameworkBdd, MochaTestFrameworkTdd } from '../../../../src/frameworks/mocha/mocha-test-framework';
import { Logger } from '../../../../src/util/logging/logger';
import { jasmineInterfaceKeywords, mochaBddInterfaceKeywords, mochaTddInterfaceKeywords } from '../parser-test-utils';

describe('AstTestFileParser', () => {
  const fakeTestFilePath = '/fake/test/file/path.ts';

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

  let mockLogger: MockProxy<Logger>;

  beforeEach(() => {
    mockLogger = mock<Logger>();
  });

  testInterfaceData.forEach(({ testInterfaceName, testInterface, _ }) => {
    describe(`using the ${testInterfaceName} test interface`, () => {
      let testParser!: TestFileParser<TestDefinitionInfo[]>;
      let testAndSuiteNodeProcessor!: TestAndSuiteNodeProcessor;

      beforeEach(() => {
        testAndSuiteNodeProcessor = new TestAndSuiteNodeProcessor(
          testInterface,
          new TestDescriptionNodeProcessor(mockLogger),
          mockLogger
        );
        testParser = new AstTestFileParser([testAndSuiteNodeProcessor], mockLogger);
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

      it('correctly parses test content having typescript type annotations', () => {
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

      it('correctly parses test content having decorators', () => {
        const fileText = `
          ${_.describe}('test suite 1', () => {
            ${_.it}('test 1', () => {
              @fakeDecorator
              class FakeClass {
                // class contents
              }
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
    });
  });
});
