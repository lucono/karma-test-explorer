import { mock, MockProxy } from 'jest-mock-extended';
import { TestSuiteInfo } from 'vscode-test-adapter-api';
import { TestGrouping } from '../../src/core/base/test-grouping';
import { TestSuiteType, TestType } from '../../src/core/base/test-infos';
import { TestSuiteOrganizationOptions, TestSuiteOrganizer } from '../../src/core/test-suite-organizer';
import '../../src/types/vscode-test-adapter-api';
import { Logger } from '../../src/util/logging/logger';
import { asTestSuiteWithUnixStylePaths as withUnixPaths } from '../test-util';

describe('TestSuiteOrganizer', () => {
  let mockLogger: MockProxy<Logger>;
  let testSuiteOrganizer: TestSuiteOrganizer;

  beforeEach(() => {
    mockLogger = mock<Logger>();
    testSuiteOrganizer = new TestSuiteOrganizer('/', '/', mockLogger);

    const organizeTests = testSuiteOrganizer.organizeTests.bind(testSuiteOrganizer);

    testSuiteOrganizer.organizeTests = (...args: Parameters<typeof organizeTests>): TestSuiteInfo => {
      return withUnixPaths(organizeTests(...args));
    };
  });

  describe('organizeTests method', () => {
    describe('when organizing a test suite by folder', () => {
      let originalTestSuite: TestSuiteInfo;
      let organizationOptions: TestSuiteOrganizationOptions;

      beforeEach(() => {
        originalTestSuite = {
          id: ':',
          type: 'suite',
          label: '',
          fullName: '',
          testCount: 1,
          children: [
            {
              id: 'suite2',
              type: 'suite',
              file: '/path-1/path-2/component-2.spec.ts',
              label: 'suite 2',
              fullName: 'suite two',
              testCount: 1,
              children: [
                {
                  id: 'spec2',
                  type: 'test',
                  file: '/path-1/path-2/component-2.spec.ts',
                  fullName: 'suite two spec two',
                  label: 'spec 2'
                }
              ]
            }
          ]
        };

        organizationOptions = {
          testGrouping: TestGrouping.Folder,
          flattenSingleChildFolders: false,
          flattenSingleSuiteFiles: false
        };
      });

      it('creates an intermediate folder suite for each parent folder of the tests in the suite', () => {
        const organizedTestSuite = testSuiteOrganizer.organizeTests(originalTestSuite, organizationOptions);

        expect(organizedTestSuite.children).toEqual(
          expect.arrayContaining([
            // folder suite: path-1
            expect.objectContaining({
              suiteType: TestSuiteType.Folder,
              path: '/path-1',
              children: expect.arrayContaining([
                // folder suite: path-2
                expect.objectContaining({
                  suiteType: TestSuiteType.Folder,
                  path: '/path-1/path-2',
                  children: expect.arrayContaining([
                    // file suite: component-2.spec.ts
                    expect.objectContaining({
                      suiteType: TestSuiteType.File,
                      file: '/path-1/path-2/component-2.spec.ts',
                      children: expect.arrayContaining([
                        // test suite: suite 2
                        expect.objectContaining({
                          id: 'suite2',
                          type: TestType.Suite,
                          file: '/path-1/path-2/component-2.spec.ts',
                          children: expect.arrayContaining([
                            // test: spec 2
                            expect.objectContaining({
                              type: TestType.Test,
                              id: 'spec2',
                              file: '/path-1/path-2/component-2.spec.ts'
                            })
                          ])
                        })
                      ])
                    })
                  ])
                })
              ])
            })
          ])
        );
      });

      it('preserves all the property values of the container node except for `children`', () => {
        const organizedTestSuite = testSuiteOrganizer.organizeTests(originalTestSuite, organizationOptions);

        expect(organizedTestSuite).toEqual(
          expect.objectContaining({
            id: ':',
            type: 'suite',
            label: '',
            fullName: '',
            testCount: 1
          })
        );
      });

      describe('and with option to flatten single child folders', () => {
        beforeEach(() => {
          organizationOptions.flattenSingleChildFolders = true;
        });

        it('creates a single intermediate folder node for the tests for several parent folder levels having only one sub-folder each', () => {
          const organizedTestSuite = testSuiteOrganizer.organizeTests(originalTestSuite, organizationOptions);

          expect(organizedTestSuite.children).toEqual(
            expect.arrayContaining([
              // folder suite: path-1/path-2
              expect.objectContaining({
                suiteType: TestSuiteType.Folder,
                path: '/path-1/path-2',
                label: 'path-1/path-2',
                children: expect.arrayContaining([
                  // file suite: component-2.spec.ts
                  expect.objectContaining({
                    suiteType: TestSuiteType.File,
                    file: '/path-1/path-2/component-2.spec.ts'
                  })
                ])
              })
            ])
          );
        });

        it('does not flatten parent folders having multiple sub-folders or files', () => {
          originalTestSuite = {
            id: ':',
            type: 'suite',
            label: '',
            fullName: '',
            testCount: 2,
            children: [
              {
                id: 'suite1',
                type: 'suite',
                file: '/path-1/component-1.spec.ts',
                label: 'suite 1',
                fullName: 'suite one',
                testCount: 0,
                children: []
              },
              {
                id: 'suite2',
                type: 'suite',
                file: '/path-1/path-2/component-2.spec.ts',
                label: 'suite 2',
                fullName: 'suite two',
                testCount: 0,
                children: []
              }
            ]
          };

          const organizedTestSuite = testSuiteOrganizer.organizeTests(originalTestSuite, organizationOptions);

          expect(organizedTestSuite.children).toEqual(
            expect.arrayContaining([
              // folder suite: path-1
              expect.objectContaining({
                suiteType: TestSuiteType.Folder,
                path: '/path-1',
                children: expect.arrayContaining([
                  // folder suite: path-1/path-2
                  expect.objectContaining({
                    suiteType: TestSuiteType.Folder,
                    path: '/path-1/path-2'
                  })
                ])
              })
            ])
          );
        });
      });

      describe('and with option to flatten single suite files', () => {
        beforeEach(() => {
          organizationOptions.flattenSingleSuiteFiles = true;
        });

        it('combines into a single node the file suite and test suite for test files having a single top-level suite', () => {
          const organizedTestSuite = testSuiteOrganizer.organizeTests(originalTestSuite, organizationOptions);

          expect(organizedTestSuite.children).toEqual(
            expect.arrayContaining([
              // folder suite: path-1
              expect.objectContaining({
                suiteType: TestSuiteType.Folder,
                path: '/path-1',
                children: expect.arrayContaining([
                  // folder suite: path-2
                  expect.objectContaining({
                    suiteType: TestSuiteType.Folder,
                    path: '/path-1/path-2',
                    children: expect.arrayContaining([
                      // file suite: component-2.spec.ts
                      expect.objectContaining({
                        suiteType: TestSuiteType.File,
                        file: '/path-1/path-2/component-2.spec.ts',
                        children: expect.arrayContaining([
                          // test: spec 2
                          expect.objectContaining({
                            type: TestType.Test,
                            id: 'spec2',
                            file: '/path-1/path-2/component-2.spec.ts'
                          })
                        ])
                      })
                    ])
                  })
                ])
              })
            ])
          );
        });

        it('uses the suite name as the label for the combined node for test files having a single top-level suite', () => {
          const organizedTestSuite = testSuiteOrganizer.organizeTests(originalTestSuite, organizationOptions);

          expect(organizedTestSuite.children).toEqual(
            expect.arrayContaining([
              // folder suite: path-1
              expect.objectContaining({
                suiteType: TestSuiteType.Folder,
                path: '/path-1',
                children: expect.arrayContaining([
                  // folder suite: path-2
                  expect.objectContaining({
                    suiteType: TestSuiteType.Folder,
                    path: '/path-1/path-2',
                    children: expect.arrayContaining([
                      // file suite: component-2.spec.ts
                      expect.objectContaining({
                        suiteType: TestSuiteType.File,
                        file: '/path-1/path-2/component-2.spec.ts',
                        label: 'suite 2'
                      })
                    ])
                  })
                ])
              })
            ])
          );
        });

        describe('for test suite files with multiple top-level suites', () => {
          beforeEach(() => {
            originalTestSuite = {
              id: ':',
              type: 'suite',
              label: '',
              fullName: '',
              testCount: 2,
              children: [
                {
                  id: 'suite1',
                  type: 'suite',
                  file: '/path-1/component-1.spec.ts',
                  label: 'suite 1',
                  fullName: 'suite one',
                  testCount: 0,
                  children: []
                },
                {
                  id: 'suite1-2',
                  type: 'suite',
                  file: '/path-1/component-1.spec.ts',
                  label: 'suite 1-2',
                  fullName: 'suite one-2',
                  testCount: 0,
                  children: []
                }
              ]
            };
          });

          it('does not combine the file suite node and test suite nodes', () => {
            const organizedTestSuite = testSuiteOrganizer.organizeTests(originalTestSuite, organizationOptions);

            expect(organizedTestSuite.children).toEqual(
              expect.arrayContaining([
                // folder suite: path-1
                expect.objectContaining({
                  suiteType: TestSuiteType.Folder,
                  path: '/path-1',
                  children: expect.arrayContaining([
                    // file suite: component-1.spec.ts
                    expect.objectContaining({
                      suiteType: TestSuiteType.File,
                      file: '/path-1/component-1.spec.ts',
                      children: expect.arrayContaining([
                        // test suite: suite 1
                        expect.objectContaining({
                          id: 'suite1',
                          type: TestType.Suite,
                          file: '/path-1/component-1.spec.ts'
                        }),
                        // test suite: suite 1-2
                        expect.objectContaining({
                          id: 'suite1-2',
                          type: TestType.Suite,
                          file: '/path-1/component-1.spec.ts'
                        })
                      ])
                    })
                  ])
                })
              ])
            );
          });

          it('uses a friendly version of the filename for the label of the file suite node', () => {
            const organizedTestSuite = testSuiteOrganizer.organizeTests(originalTestSuite, organizationOptions);

            expect(organizedTestSuite.children).toEqual(
              expect.arrayContaining([
                // folder suite: path-1
                expect.objectContaining({
                  suiteType: TestSuiteType.Folder,
                  path: '/path-1',
                  children: expect.arrayContaining([
                    // file suite: component-1.spec.ts
                    expect.objectContaining({
                      suiteType: TestSuiteType.File,
                      file: '/path-1/component-1.spec.ts',
                      label: 'component-1'
                    })
                  ])
                })
              ])
            );
          });
        });
      });

      it('uses the specified tests base path as the root of the test tree if it is a sub-folder of the root path', () => {
        const rootPath = '/';
        const testsBasePath = '/path-1';
        testSuiteOrganizer = new TestSuiteOrganizer(rootPath, testsBasePath, mockLogger);

        const organizedTestSuite = withUnixPaths(
          testSuiteOrganizer.organizeTests(originalTestSuite, organizationOptions)
        );

        expect(organizedTestSuite.children).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              suiteType: TestSuiteType.Folder,
              path: `${testsBasePath}/path-2`,
              label: 'path-2'
            })
          ])
        );
      });
    });
  });
});
