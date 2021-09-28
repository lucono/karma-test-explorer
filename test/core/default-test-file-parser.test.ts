import { mock, MockProxy } from 'jest-mock-extended';
import { TestInterface } from '../../src/core/base/test-framework';
import { DefaultTestFileParser } from '../../src/core/default-test-file-parser';
import { TestNodeType } from '../../src/core/test-file-parser';
import { JasmineTestFramework } from '../../src/frameworks/jasmine/jasmine-test-framework';
import { MochaTestFrameworkBdd, MochaTestFrameworkTdd } from '../../src/frameworks/mocha/mocha-test-framework';
import { Logger } from '../../src/util/logging/logger';

describe('DefaultTestFileParser', () => {
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
    { testInterfaceName: 'jasmine', testInterface: jasmineTestInterface },
    { testInterfaceName: 'mocha-bdd', testInterface: mochaBddTestInterface }
  ])('using the $testInterfaceName test interface', ({ testInterface }) => {
    it('correctly parses single-line comments', () => {
      const testParser = new DefaultTestFileParser(testInterface, mockLogger);
      const fileText = `
        // single-line comment
        describe('test suite 1', () => {
          // single-line comment
          it('test 1', () => {
            const msg = 'hello';
            // single-line comment
          });
          // single-line comment
          it ('test 2', () => {
            const msg = 'world!';
          });
        })
        // single-line comment
      `;
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([{ description: 'test suite 1', lineNumber: 2 }]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([
        { description: 'test 1', lineNumber: 4 },
        { description: 'test 2', lineNumber: 9 }
      ]);
    });

    it('correctly parses multi-line comments', () => {
      const testParser = new DefaultTestFileParser(testInterface, mockLogger);
      const fileText = `
        /* multi-line comment with comment opening
        and closing on same lines as text */
        describe('test suite 1', () => {
          /*
          multi-line comment
          multi-line comment
          */
          it('test 1', () => {
            const msg = 'hello';
          });
          /* multi-line comment on single line */
          it ('test 2', () => {
            const msg = 'world!';
          });
        })
      `;
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([{ description: 'test suite 1', lineNumber: 3 }]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([
        { description: 'test 1', lineNumber: 8 },
        { description: 'test 2', lineNumber: 12 }
      ]);
    });

    it('correctly parses commented out tests', () => {
      const testParser = new DefaultTestFileParser(testInterface, mockLogger);
      const fileText = `
        describe('test suite 1', () => {
          /*
          it('commented out test 1') {
            test contents
          }
          */
          it('test 1', () => {
            // it('commented out test 2') {
            //   test contents
            // }
          });
        })
      `;
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([{ description: 'test suite 1', lineNumber: 1 }]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([{ description: 'test 1', lineNumber: 7 }]);
    });

    it('correctly parses a combination of various kinds of comments in the same file', () => {
      const testParser = new DefaultTestFileParser(testInterface, mockLogger);
      const fileText = `
        describe('test suite 1', () => {
          it('test 1', () => {
            // single-line comments
            /*
            multi-line comment
            multi-line comment
            */
          });
          /*
          it('commented out test 1') {
            // test contents
          });
          */
        })
      `;
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([{ description: 'test suite 1', lineNumber: 1 }]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([{ description: 'test 1', lineNumber: 2 }]);
    });

    it('correctly parses non-arrow function tests', () => {
      const testParser = new DefaultTestFileParser(testInterface, mockLogger);
      const fileText = `
        describe('test suite 1', function() {
          it('test 1', function() {
            // test contents
          });
        })
      `;
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([{ description: 'test suite 1', lineNumber: 1 }]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([{ description: 'test 1', lineNumber: 2 }]);
    });

    it('correctly parses test description containing curly brace', () => {
      const testParser = new DefaultTestFileParser(testInterface, mockLogger);
      const fileText = `
        describe('test { suite 1', function() {
          it('test } 1', function() {
            // test contents
          });
        })
      `;
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([{ description: 'test { suite 1', lineNumber: 1 }]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([{ description: 'test } 1', lineNumber: 2 }]);
    });

    it('correctly parses test description containing parentheses', () => {
      const testParser = new DefaultTestFileParser(testInterface, mockLogger);
      const fileText = `
        describe('test ( suite 1', function() {
          it('test ) 1', function() {
            // test contents
          });
        })
      `;
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([{ description: 'test ( suite 1', lineNumber: 1 }]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([{ description: 'test ) 1', lineNumber: 2 }]);
    });

    it('correctly parses single-line test format', () => {
      const testParser = new DefaultTestFileParser(testInterface, mockLogger);
      const fileText = `
        describe('test suite 1', () => {
          it('test 1', () => { /* test contents */ });
        })
      `;
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([{ description: 'test suite 1', lineNumber: 1 }]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([{ description: 'test 1', lineNumber: 2 }]);
    });

    it('correctly parses nested test suites', () => {
      const testParser = new DefaultTestFileParser(testInterface, mockLogger);
      const fileText = `
          describe('test suite 1', () => {
            describe('test suite 2', () => {
              describe('test suite 3', () => {
                  it('test 1', () => {
                      // test contents
                  });
              });
            });
        });
      `;

      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([
        { description: 'test suite 1', lineNumber: 1 },
        { description: 'test suite 2', lineNumber: 2 },
        { description: 'test suite 3', lineNumber: 3 }
      ]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([{ description: 'test 1', lineNumber: 4 }]);
    });

    it('correctly parses file with multiple top level suites', () => {
      const testParser = new DefaultTestFileParser(testInterface, mockLogger);
      const fileText = `
        describe('test suite 1', {
          it('test 1', () => {
            // test contents
          })
        });
        describe('test suite 2', {
          it('test 2', () => {
            // test contents
          })
        });
      `;

      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([
        { description: 'test suite 1', lineNumber: 1 },
        { description: 'test suite 2', lineNumber: 6 }
      ]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([
        { description: 'test 1', lineNumber: 2 },
        { description: 'test 2', lineNumber: 7 }
      ]);
    });
  });

  // --- Jasmine ---

  describe('using the jasmine test interface', () => {
    let testInterface: TestInterface;

    beforeEach(() => {
      testInterface = jasmineTestInterface;
    });

    it('correctly parses focused suites', () => {
      const testParser = new DefaultTestFileParser(testInterface, mockLogger);
      const fileText = `
        fdescribe('test suite 1', () => {
          it('test 1', () => {
            // test contents
          });
        })
      `;
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([{ description: 'test suite 1', lineNumber: 1 }]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([{ description: 'test 1', lineNumber: 2 }]);
    });

    it('correctly parses focused tests', () => {
      const testParser = new DefaultTestFileParser(testInterface, mockLogger);
      const fileText = `
        describe('test suite 1', () => {
          fit('test 1', () => {
            // test contents
          });
        })
      `;
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([{ description: 'test suite 1', lineNumber: 1 }]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([{ description: 'test 1', lineNumber: 2 }]);
    });

    it('correctly parses disabled suites', () => {
      const testParser = new DefaultTestFileParser(testInterface, mockLogger);
      const fileText = `
        xdescribe('test suite 1', () => {
          it('test 1', () => {
            // test contents
          });
        })
      `;
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([{ description: 'test suite 1', lineNumber: 1 }]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([{ description: 'test 1', lineNumber: 2 }]);
    });

    it('correctly parses disabled tests', () => {
      const testParser = new DefaultTestFileParser(testInterface, mockLogger);
      const fileText = `
      describe('test suite 1', () => {
        xit('test 1', () => {
          // test contents
        });
      })
      `;
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([{ description: 'test suite 1', lineNumber: 1 }]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([{ description: 'test 1', lineNumber: 2 }]);
    });
  });

  // --- Mocha BDD ---

  describe('using the mocha-bdd test interface', () => {
    let testInterface: TestInterface;

    beforeEach(() => {
      testInterface = mochaBddTestInterface;
    });

    it('correctly parses focused suites', () => {
      const testParser = new DefaultTestFileParser(testInterface, mockLogger);
      const fileText = `
        describe.only('test suite 1', () => {
          it('test 1', () => {
            // test contents
          });
        })
      `;
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([{ description: 'test suite 1', lineNumber: 1 }]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([{ description: 'test 1', lineNumber: 2 }]);
    });

    it('correctly parses focused tests', () => {
      const testParser = new DefaultTestFileParser(testInterface, mockLogger);
      const fileText = `
        describe('test suite 1', () => {
          it.only('test 1', () => {
            // test contents
          });
        })
      `;
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([{ description: 'test suite 1', lineNumber: 1 }]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([{ description: 'test 1', lineNumber: 2 }]);
    });

    it('correctly parses disabled suites', () => {
      const testParser = new DefaultTestFileParser(testInterface, mockLogger);
      const fileText = `
        describe.skip('test suite 1', () => {
          it('test 1', () => {
            // test contents
          });
        })
      `;
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([{ description: 'test suite 1', lineNumber: 1 }]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([{ description: 'test 1', lineNumber: 2 }]);
    });

    it('correctly parses disabled tests', () => {
      const testParser = new DefaultTestFileParser(testInterface, mockLogger);
      const fileText = `
      describe('test suite 1', () => {
        it.skip('test 1', () => {
          // test contents
        });
      })
      `;
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([{ description: 'test suite 1', lineNumber: 1 }]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([{ description: 'test 1', lineNumber: 2 }]);
    });
  });

  // --- Mocha TDD ---

  describe('using the mocha-tdd test interface', () => {
    let testInterface: TestInterface;

    beforeEach(() => {
      testInterface = mochaTddTestInterface;
    });

    it('correctly parses single-line comments', () => {
      const testParser = new DefaultTestFileParser(testInterface, mockLogger);
      const fileText = `
        // single-line comment
        suite('test suite 1', () => {
          // single-line comment
          test('test 1', () => {
            const msg = 'hello';
            // single-line comment
          });
          // single-line comment
          test('test 2', () => {
            const msg = 'world!';
          });
        })
        // single-line comment
      `;
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([{ description: 'test suite 1', lineNumber: 2 }]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([
        { description: 'test 1', lineNumber: 4 },
        { description: 'test 2', lineNumber: 9 }
      ]);
    });

    it('correctly parses multi-line comments', () => {
      const testParser = new DefaultTestFileParser(testInterface, mockLogger);
      const fileText = `
        /* multi-line comment with comment opening
        and closing on same lines as text */
        suite('test suite 1', () => {
          /*
          multi-line comment
          multi-line comment
          */
          test('test 1', () => {
            const msg = 'hello';
          });
          /* multi-line comment on single line */
          test ('test 2', () => {
            const msg = 'world!';
          });
        })
      `;
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([{ description: 'test suite 1', lineNumber: 3 }]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([
        { description: 'test 1', lineNumber: 8 },
        { description: 'test 2', lineNumber: 12 }
      ]);
    });

    it('correctly parses commented out tests', () => {
      const testParser = new DefaultTestFileParser(testInterface, mockLogger);
      const fileText = `
        suite('test suite 1', () => {
          /*
          test('commented out test 1') {
            test contents
          }
          */
          test('test 1', () => {
            // test('commented out test 2') {
            //   test contents
            // }
          });
        })
      `;
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([{ description: 'test suite 1', lineNumber: 1 }]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([{ description: 'test 1', lineNumber: 7 }]);
    });

    it('correctly parses a combination of various kinds of comments in the same file', () => {
      const testParser = new DefaultTestFileParser(testInterface, mockLogger);
      const fileText = `
        suite('test suite 1', () => {
          test('test 1', () => {
            // single-line comments
            /*
            multi-line comment
            multi-line comment
            */
          });
          /*
          test('commented out test 1') {
            // test contents
          });
          */
        })
      `;
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([{ description: 'test suite 1', lineNumber: 1 }]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([{ description: 'test 1', lineNumber: 2 }]);
    });

    it('correctly parses non-arrow function tests', () => {
      const testParser = new DefaultTestFileParser(testInterface, mockLogger);
      const fileText = `
        suite('test suite 1', function() {
          test('test 1', function() {
            // test contents
          });
        })
      `;
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([{ description: 'test suite 1', lineNumber: 1 }]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([{ description: 'test 1', lineNumber: 2 }]);
    });

    it('correctly parses test description containing curly brace', () => {
      const testParser = new DefaultTestFileParser(testInterface, mockLogger);
      const fileText = `
        suite('test { suite 1', function() {
          test('test } 1', function() {
            // test contents
          });
        })
      `;
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([{ description: 'test { suite 1', lineNumber: 1 }]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([{ description: 'test } 1', lineNumber: 2 }]);
    });

    it('correctly parses test description containing parentheses', () => {
      const testParser = new DefaultTestFileParser(testInterface, mockLogger);
      const fileText = `
        suite('test ( suite 1', function() {
          test('test ) 1', function() {
            // test contents
          });
        })
      `;
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([{ description: 'test ( suite 1', lineNumber: 1 }]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([{ description: 'test ) 1', lineNumber: 2 }]);
    });

    it('correctly parses single-line test format', () => {
      const testParser = new DefaultTestFileParser(testInterface, mockLogger);
      const fileText = `
        suite('test suite 1', () => {
          test('test 1', () => { /* test contents */ });
        })
      `;
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([{ description: 'test suite 1', lineNumber: 1 }]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([{ description: 'test 1', lineNumber: 2 }]);
    });

    it('correctly parses nested test suites', () => {
      const testParser = new DefaultTestFileParser(testInterface, mockLogger);
      const fileText = `
					suite('test suite 1', () => {
						suite('test suite 2', () => {
							suite('test suite 3', () => {
									test('test 1', () => {
											// test contents
									});
							});
						});
				});
			`;

      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([
        { description: 'test suite 1', lineNumber: 1 },
        { description: 'test suite 2', lineNumber: 2 },
        { description: 'test suite 3', lineNumber: 3 }
      ]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([{ description: 'test 1', lineNumber: 4 }]);
    });

    it('correctly parses file with multiple top level suites', () => {
      const testParser = new DefaultTestFileParser(testInterface, mockLogger);
      const fileText = `
        suite('test suite 1', {
          test('test 1', () => {
            // test contents
          })
        });
        suite('test suite 2', {
          test('test 2', () => {
            // test contents
          })
        });
      `;

      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([
        { description: 'test suite 1', lineNumber: 1 },
        { description: 'test suite 2', lineNumber: 6 }
      ]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([
        { description: 'test 1', lineNumber: 2 },
        { description: 'test 2', lineNumber: 7 }
      ]);
    });

    it('correctly parses focused suites', () => {
      const testParser = new DefaultTestFileParser(testInterface, mockLogger);
      const fileText = `
        suite.only('test suite 1', () => {
          test('test 1', () => {
            // test contents
          });
        })
      `;
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([{ description: 'test suite 1', lineNumber: 1 }]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([{ description: 'test 1', lineNumber: 2 }]);
    });

    it('correctly parses focused tests', () => {
      const testParser = new DefaultTestFileParser(testInterface, mockLogger);
      const fileText = `
        suite('test suite 1', () => {
          test.only('test 1', () => {
            // test contents
          });
        })
      `;
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([{ description: 'test suite 1', lineNumber: 1 }]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([{ description: 'test 1', lineNumber: 2 }]);
    });

    it('correctly parses disabled suites', () => {
      const testParser = new DefaultTestFileParser(testInterface, mockLogger);
      const fileText = `
        suite.skip('test suite 1', () => {
          test('test 1', () => {
            // test contents
          });
        })
      `;
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([{ description: 'test suite 1', lineNumber: 1 }]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([{ description: 'test 1', lineNumber: 2 }]);
    });

    it('correctly parses disabled tests', () => {
      const testParser = new DefaultTestFileParser(testInterface, mockLogger);
      const fileText = `
      suite('test suite 1', () => {
        test.skip('test 1', () => {
          // test contents
        });
      })
      `;
      const testSuiteFileInfo = testParser.parseFileText(fileText);

      expect(testSuiteFileInfo[TestNodeType.Suite]).toEqual([{ description: 'test suite 1', lineNumber: 1 }]);
      expect(testSuiteFileInfo[TestNodeType.Test]).toEqual([{ description: 'test 1', lineNumber: 2 }]);
    });
  });
});
