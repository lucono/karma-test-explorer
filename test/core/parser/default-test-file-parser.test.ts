import { mock, MockProxy } from 'jest-mock-extended';
import { TestDefinitionState } from '../../../src/core/base/test-definition';
import { TestNodeType } from '../../../src/core/base/test-node';
import { RegexTestFileParser } from '../../../src/core/parser/regex-test-file-parser';
import { JasmineTestFramework } from '../../../src/frameworks/jasmine/jasmine-test-framework';
import { MochaTestFrameworkBdd, MochaTestFrameworkTdd } from '../../../src/frameworks/mocha/mocha-test-framework';
import { Logger } from '../../../src/util/logging/logger';

interface InterfaceKeywords {
  readonly describe: string;
  readonly fdescribe: string;
  readonly xdescribe: string;
  readonly it: string;
  readonly fit: string;
  readonly xit: string;
}

const jasmineInterfaceKeywords: InterfaceKeywords = {
  describe: 'describe',
  fdescribe: 'fdescribe',
  xdescribe: 'xdescribe',
  it: 'it',
  fit: 'fit',
  xit: 'xit'
};

const mochaBddInterfaceKeywords: InterfaceKeywords = {
  describe: 'describe',
  fdescribe: 'describe.only',
  xdescribe: 'describe.skip',
  it: 'it',
  fit: 'it.only',
  xit: 'it.skip'
};

const mochaTddInterfaceKeywords: InterfaceKeywords = {
  describe: 'suite',
  fdescribe: 'suite.only',
  xdescribe: 'suite.skip',
  it: 'test',
  fit: 'test.only',
  xit: 'test.skip'
};

describe('RegexTestFileParser', () => {
  let mockLogger: MockProxy<Logger>;
  let jasmineTestInterface = JasmineTestFramework.getTestInterface();
  let mochaBddTestInterface = MochaTestFrameworkBdd.getTestInterface();
  let mochaTddTestInterface = MochaTestFrameworkTdd.getTestInterface();

  beforeEach(() => {
    mockLogger = mock<Logger>();
    jasmineTestInterface = JasmineTestFramework.getTestInterface();
    mochaBddTestInterface = MochaTestFrameworkBdd.getTestInterface();
    mochaTddTestInterface = MochaTestFrameworkTdd.getTestInterface();
  });

  describe.each([
    {
      testInterfaceName: 'jasmine',
      testInterface: jasmineTestInterface,
      _: jasmineInterfaceKeywords
    },
    {
      testInterfaceName: 'mocha-bdd',
      testInterface: mochaBddTestInterface,
      _: mochaBddInterfaceKeywords
    },
    {
      testInterfaceName: 'mocha-tdd',
      testInterface: mochaTddTestInterface,
      _: mochaTddInterfaceKeywords
    }
  ])('using the $testInterfaceName test interface', ({ testInterface, _ }) => {
    it('correctly parses single-line comments', () => {
      const testParser = new RegexTestFileParser(testInterface, mockLogger);
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
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([
        {
          type: TestNodeType.Suite,
          description: 'test suite 1',
          line: 2,
          state: TestDefinitionState.Default
        }
      ]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([
        { type: TestNodeType.Test, description: 'test 1', line: 4, state: TestDefinitionState.Default },
        { type: TestNodeType.Test, description: 'test 2', line: 9, state: TestDefinitionState.Default }
      ]);
    });

    it('correctly parses multi-line comments', () => {
      const testParser = new RegexTestFileParser(testInterface, mockLogger);
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
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([
        {
          type: TestNodeType.Suite,
          description: 'test suite 1',
          line: 3,
          state: TestDefinitionState.Default
        }
      ]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([
        { type: TestNodeType.Test, description: 'test 1', line: 8, state: TestDefinitionState.Default },
        { type: TestNodeType.Test, description: 'test 2', line: 12, state: TestDefinitionState.Default }
      ]);
    });

    it('correctly parses commented out tests', () => {
      const testParser = new RegexTestFileParser(testInterface, mockLogger);
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
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([
        {
          type: TestNodeType.Suite,
          description: 'test suite 1',
          line: 1,
          state: TestDefinitionState.Default
        }
      ]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([
        { type: TestNodeType.Test, description: 'test 1', line: 7, state: TestDefinitionState.Default }
      ]);
    });

    it('correctly parses a combination of various kinds of comments in the same file', () => {
      const testParser = new RegexTestFileParser(testInterface, mockLogger);
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
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([
        {
          type: TestNodeType.Suite,
          description: 'test suite 1',
          line: 1,
          state: TestDefinitionState.Default
        }
      ]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([
        { type: TestNodeType.Test, description: 'test 1', line: 2, state: TestDefinitionState.Default }
      ]);
    });

    it('correctly parses non-arrow function tests', () => {
      const testParser = new RegexTestFileParser(testInterface, mockLogger);
      const fileText = `
        ${_.describe}('test suite 1', function() {
          ${_.it}('test 1', function() {
            // test contents
          });
        })
      `;
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([
        {
          type: TestNodeType.Suite,
          description: 'test suite 1',
          line: 1,
          state: TestDefinitionState.Default
        }
      ]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([
        { type: TestNodeType.Test, description: 'test 1', line: 2, state: TestDefinitionState.Default }
      ]);
    });

    it('correctly parses test description containing curly brace', () => {
      const testParser = new RegexTestFileParser(testInterface, mockLogger);
      const fileText = `
        ${_.describe}('test { suite 1', function() {
          ${_.it}('test } 1', function() {
            // test contents
          });
        })
      `;
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([
        {
          type: TestNodeType.Suite,
          description: 'test { suite 1',
          line: 1,
          state: TestDefinitionState.Default
        }
      ]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([
        { type: TestNodeType.Test, description: 'test } 1', line: 2, state: TestDefinitionState.Default }
      ]);
    });

    it('correctly parses test description containing parentheses', () => {
      const testParser = new RegexTestFileParser(testInterface, mockLogger);
      const fileText = `
        ${_.describe}('test ( suite 1', function() {
          ${_.it}('test ) 1', function() {
            // test contents
          });
        })
      `;
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([
        {
          type: TestNodeType.Suite,
          description: 'test ( suite 1',
          line: 1,
          state: TestDefinitionState.Default
        }
      ]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([
        { type: TestNodeType.Test, description: 'test ) 1', line: 2, state: TestDefinitionState.Default }
      ]);
    });

    it('correctly parses single-line test format', () => {
      const testParser = new RegexTestFileParser(testInterface, mockLogger);
      const fileText = `
        ${_.describe}('test suite 1', () => {
          ${_.it}('test 1', () => { /* test contents */ });
        })
      `;
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([
        {
          type: TestNodeType.Suite,
          description: 'test suite 1',
          line: 1,
          state: TestDefinitionState.Default
        }
      ]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([
        { type: TestNodeType.Test, description: 'test 1', line: 2, state: TestDefinitionState.Default }
      ]);
    });

    it('correctly parses tests defined starting on the first line of the file', () => {
      const testParser = new RegexTestFileParser(testInterface, mockLogger);
      const fileText =
        // First line begins below
        `${_.describe}('test suite 1', () => {
          ${_.it}('test 1', () => { /* test contents */ });
        })
      `;
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([
        {
          type: TestNodeType.Suite,
          description: 'test suite 1',
          line: 0,
          state: TestDefinitionState.Default
        }
      ]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([
        { type: TestNodeType.Test, description: 'test 1', line: 1, state: TestDefinitionState.Default }
      ]);
    });

    it('correctly parses nested test suites with no identical test descriptions', () => {
      const testParser = new RegexTestFileParser(testInterface, mockLogger);
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

      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([
        {
          type: TestNodeType.Suite,
          description: 'test suite 1',
          line: 1,
          state: TestDefinitionState.Default
        },
        {
          type: TestNodeType.Suite,
          description: 'test suite 2',
          line: 2,
          state: TestDefinitionState.Default
        },
        {
          type: TestNodeType.Suite,
          description: 'test suite 3',
          line: 3,
          state: TestDefinitionState.Default
        }
      ]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([
        { type: TestNodeType.Test, description: 'test 1', line: 4, state: TestDefinitionState.Default }
      ]);
    });

    it('correctly parses nested test suites with one or more identical test descriptions', () => {
      const testParser = new RegexTestFileParser(testInterface, mockLogger);
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

      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([
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
      ]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([
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
      ]);
    });

    it('correctly parses file with multiple top level suites', () => {
      const testParser = new RegexTestFileParser(testInterface, mockLogger);
      const fileText = `
        ${_.describe}('test suite 1', {
          ${_.it}('test 1', () => {
            // test contents
          })
        });
        ${_.describe}('test suite 2', {
          ${_.it}('test 2', () => {
            // test contents
          })
        });
      `;

      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([
        {
          type: TestNodeType.Suite,
          description: 'test suite 1',
          line: 1,
          state: TestDefinitionState.Default
        },
        {
          type: TestNodeType.Suite,
          description: 'test suite 2',
          line: 6,
          state: TestDefinitionState.Default
        }
      ]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([
        { type: TestNodeType.Test, description: 'test 1', line: 2, state: TestDefinitionState.Default },
        { type: TestNodeType.Test, description: 'test 2', line: 7, state: TestDefinitionState.Default }
      ]);
    });

    it('correctly parses focused suites', () => {
      const testParser = new RegexTestFileParser(testInterface, mockLogger);
      const fileText = `
        ${_.fdescribe}('test suite 1', () => {
          ${_.it}('test 1', () => {
            // test contents
          });
        })
      `;
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([
        {
          type: TestNodeType.Suite,
          description: 'test suite 1',
          line: 1,
          state: TestDefinitionState.Focused
        }
      ]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([
        { type: TestNodeType.Test, description: 'test 1', line: 2, state: TestDefinitionState.Default }
      ]);
    });

    it('correctly parses focused tests', () => {
      const testParser = new RegexTestFileParser(testInterface, mockLogger);
      const fileText = `
        ${_.describe}('test suite 1', () => {
          ${_.fit}('test 1', () => {
            // test contents
          });
        })
      `;
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([
        {
          type: TestNodeType.Suite,
          description: 'test suite 1',
          line: 1,
          state: TestDefinitionState.Default
        }
      ]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([
        { type: TestNodeType.Test, description: 'test 1', line: 2, state: TestDefinitionState.Focused }
      ]);
    });

    it('correctly parses disabled suites', () => {
      const testParser = new RegexTestFileParser(testInterface, mockLogger);
      const fileText = `
        ${_.xdescribe}('test suite 1', () => {
          ${_.it}('test 1', () => {
            // test contents
          });
        })
      `;
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([
        {
          type: TestNodeType.Suite,
          description: 'test suite 1',
          line: 1,
          state: TestDefinitionState.Disabled
        }
      ]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([
        { type: TestNodeType.Test, description: 'test 1', line: 2, state: TestDefinitionState.Default }
      ]);
    });

    it('correctly parses disabled tests', () => {
      const testParser = new RegexTestFileParser(testInterface, mockLogger);
      const fileText = `
        ${_.describe}('test suite 1', () => {
          ${_.xit}('test 1', () => {
            // test contents
          });
        })
      `;
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([
        {
          type: TestNodeType.Suite,
          description: 'test suite 1',
          line: 1,
          state: TestDefinitionState.Default
        }
      ]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([
        { type: TestNodeType.Test, description: 'test 1', line: 2, state: TestDefinitionState.Disabled }
      ]);
    });
  });
});
