import { MockProxy, mock } from 'jest-mock-extended';

import { TestFactory } from '../../src/api/test-factory.js';
import { TestRunExecutor } from '../../src/api/test-run-executor.js';
import { TestServerExecutor } from '../../src/api/test-server-executor.js';
import { CascadingTestFactory } from '../../src/core/cascading-test-factory.js';
import { KarmaTestListener } from '../../src/frameworks/karma/runner/karma-test-listener.js';
import { TestDiscoveryProcessor } from '../../src/frameworks/karma/runner/test-discovery-processor.js';
import { Logger } from '../../src/util/logging/logger.js';

describe('CascadingTestFactory', () => {
  let mockLogger: MockProxy<Logger>;

  beforeEach(() => {
    mockLogger = mock<Logger>();
  });

  describe('with multiple delegate factories', () => {
    let testServerAndRunnerAndServerExecutorFactory: Pick<
      TestFactory,
      'createTestServer' | 'createTestRunner' | 'createTestServerExecutor' | 'dispose'
    >;
    let testServerAndRunnerAndRunExecutorFactory: Pick<
      TestFactory,
      'createTestServer' | 'createTestRunner' | 'createTestRunExecutor' | 'dispose'
    >;
    let testServerAndRunnerFactory: Pick<TestFactory, 'createTestServer' | 'createTestRunner' | 'dispose'>;
    let testServerFactory: Pick<TestFactory, 'createTestServer' | 'dispose'>;
    let testRunnerFactory: Pick<TestFactory, 'createTestRunner' | 'dispose'>;

    beforeEach(() => {
      testServerAndRunnerAndServerExecutorFactory = {
        createTestServer: jest.fn(),
        createTestRunner: jest.fn(),
        createTestServerExecutor: jest.fn(),
        dispose: jest.fn()
      };
      testServerAndRunnerAndRunExecutorFactory = {
        createTestServer: jest.fn(),
        createTestRunner: jest.fn(),
        createTestRunExecutor: jest.fn(),
        dispose: jest.fn()
      };
      testServerAndRunnerFactory = { createTestServer: jest.fn(), createTestRunner: jest.fn(), dispose: jest.fn() };
      testRunnerFactory = { createTestRunner: jest.fn(), dispose: jest.fn() };
      testServerFactory = { createTestServer: jest.fn(), dispose: jest.fn() };
    });

    describe('the createTestServer method', () => {
      it('calls through to the last delegate factory that implements the factory method', () => {
        const delegateFactories = [
          testServerAndRunnerAndServerExecutorFactory,
          testServerFactory,
          testServerAndRunnerFactory,
          testRunnerFactory
        ];
        const cascadingTestFactory = new CascadingTestFactory(delegateFactories, mockLogger);
        const mockServerExecutor = mock<TestServerExecutor>();

        cascadingTestFactory.createTestServer(mockServerExecutor);

        expect(testServerAndRunnerAndServerExecutorFactory.createTestServer).not.toHaveBeenCalled();
        expect(testServerFactory.createTestServer).not.toHaveBeenCalled();

        expect(testServerAndRunnerFactory.createTestServer).toHaveBeenCalledTimes(1);
        expect(testServerAndRunnerFactory.createTestServer).toHaveBeenCalledWith(mockServerExecutor);
      });

      it('obtains the test server executor from the corresponding factory method when no test server executor is supplied', () => {
        const delegateFactories = [
          testServerAndRunnerFactory,
          testServerAndRunnerAndServerExecutorFactory,
          testRunnerFactory,
          testServerFactory
        ];
        const cascadingTestFactory = new CascadingTestFactory(delegateFactories, mockLogger);

        cascadingTestFactory.createTestServer();

        expect(testServerAndRunnerAndServerExecutorFactory.createTestServerExecutor).toHaveBeenCalledTimes(1);
        const expectedTestServerExecutor = (testServerAndRunnerAndServerExecutorFactory.createTestServerExecutor as any)
          .mock.results[0].value;

        expect(testServerFactory.createTestServer).toHaveBeenCalledTimes(1);
        expect(testServerFactory.createTestServer).toHaveBeenCalledWith(expectedTestServerExecutor);
      });

      it('throws an exception if no delegate factory implements the method', () => {
        const delegateFactories = [testRunnerFactory];
        const cascadingTestFactory = new CascadingTestFactory(delegateFactories, mockLogger);

        expect(() => cascadingTestFactory.createTestServer()).toThrow(
          'There are no delegate test factories able to fulfil requested action: Create Test Server'
        );
      });
    });

    describe('the createTestRunner method', () => {
      it('calls through to the last delegate factory that implements the factory method', () => {
        const delegateFactories = [
          testServerAndRunnerAndServerExecutorFactory,
          testServerAndRunnerFactory,
          testRunnerFactory,
          testServerFactory
        ];
        const cascadingTestFactory = new CascadingTestFactory(delegateFactories, mockLogger);

        const mockTestListener = mock<KarmaTestListener>();
        const mockTestDiscoveryProcessor = mock<TestDiscoveryProcessor>();
        const mockTestRunExecutor = mock<TestRunExecutor>();
        cascadingTestFactory.createTestRunner(mockTestListener, mockTestDiscoveryProcessor, mockTestRunExecutor);

        expect(testServerAndRunnerAndServerExecutorFactory.createTestRunner).not.toHaveBeenCalled();
        expect(testServerAndRunnerFactory.createTestRunner).not.toHaveBeenCalled();

        expect(testRunnerFactory.createTestRunner).toHaveBeenCalledTimes(1);

        expect(testRunnerFactory.createTestRunner).toHaveBeenCalledWith(
          mockTestListener,
          mockTestDiscoveryProcessor,
          mockTestRunExecutor
        );
      });

      it('obtains the test run executor from the corresponding factory method when no test server executor is supplied', () => {
        const delegateFactories = [
          testServerAndRunnerAndRunExecutorFactory,
          testServerAndRunnerFactory,
          testRunnerFactory,
          testServerFactory
        ];
        const cascadingTestFactory = new CascadingTestFactory(delegateFactories, mockLogger);

        const mockTestListener = mock<KarmaTestListener>();
        const mockTestDiscoveryProcessor = mock<TestDiscoveryProcessor>();
        cascadingTestFactory.createTestRunner(mockTestListener, mockTestDiscoveryProcessor);

        expect(testServerAndRunnerAndRunExecutorFactory.createTestRunExecutor).toHaveBeenCalledTimes(1);
        const expectedTestRunExecutor = (testServerAndRunnerAndRunExecutorFactory.createTestRunExecutor as any).mock
          .results[0].value;

        expect(testRunnerFactory.createTestRunner).toHaveBeenCalledTimes(1);
        expect(testRunnerFactory.createTestRunner).toHaveBeenCalledWith(
          mockTestListener,
          mockTestDiscoveryProcessor,
          expectedTestRunExecutor
        );
      });

      it('throws an exception if no delegate factory implements the method', () => {
        const delegateFactories = [testServerFactory];
        const cascadingTestFactory = new CascadingTestFactory(delegateFactories, mockLogger);

        expect(() =>
          cascadingTestFactory.createTestRunner(
            mock<KarmaTestListener>(),
            mock<TestDiscoveryProcessor>(),
            mock<TestRunExecutor>()
          )
        ).toThrow('There are no delegate test factories able to fulfil requested action: Create Test Runner');
      });
    });
  });
});
