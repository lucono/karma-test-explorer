import { mock, MockProxy } from 'jest-mock-extended';
import { TestFramework } from '../../../src/core/base/test-framework';
import { ExtensionConfig, TestTriggerMethod } from '../../../src/core/config/extension-config';
import { JasmineTestFramework } from '../../../src/frameworks/jasmine/jasmine-test-framework';
import { KarmaFactory } from '../../../src/frameworks/karma/karma-factory';
import { KarmaCommandLineTestRunExecutor } from '../../../src/frameworks/karma/runner/karma-command-line-test-run-executor';
import { KarmaHttpTestRunExecutor } from '../../../src/frameworks/karma/runner/karma-http-test-run-executor';
import { KarmaCommandLineTestServerExecutor } from '../../../src/frameworks/karma/server/karma-command-line-test-server-executor';
import { SimpleLogger } from '../../../src/util/logging/simple-logger';
import { ProcessHandler } from '../../../src/util/process/process-handler';
import { ProcessLog } from '../../../src/util/process/process-log';
import { Writeable } from '../../test-util';

jest.mock('../../../src/frameworks/karma/server/karma-command-line-test-server-executor');
jest.mock('../../../src/frameworks/karma/runner/karma-command-line-test-run-executor');
jest.mock('../../../src/frameworks/karma/runner/karma-http-test-run-executor');

const MockKarmaCommandLineTestServerExecutor = KarmaCommandLineTestServerExecutor as jest.MockedClass<
  typeof KarmaCommandLineTestServerExecutor
>;
const MockKarmaCommandLineTestRunExecutor = KarmaCommandLineTestRunExecutor as jest.MockedClass<
  typeof KarmaCommandLineTestRunExecutor
>;
const MockKarmaHttpTestRunExecutor = KarmaHttpTestRunExecutor as jest.MockedClass<typeof KarmaHttpTestRunExecutor>;

describe('KarmaFactory', () => {
  let framework: TestFramework;
  let mockConfig: ExtensionConfig;
  let mockProcessHandler: ProcessHandler;
  let mockProcessLog: MockProxy<ProcessLog>;
  let mockLogger: MockProxy<SimpleLogger>;

  beforeEach(() => {
    MockKarmaCommandLineTestServerExecutor.mockClear();
    MockKarmaCommandLineTestRunExecutor.mockClear();
    MockKarmaHttpTestRunExecutor.mockClear();

    framework = JasmineTestFramework;
    mockConfig = {} as ExtensionConfig;
    mockProcessHandler = mock<ProcessHandler>();
    mockProcessLog = mock<ProcessLog>();
    mockLogger = mock<SimpleLogger>();
  });

  describe('createTestRunExecutor factory method', () => {
    describe('when the test trigger method is set to Cli', () => {
      beforeEach(() => {
        (mockConfig as Writeable<ExtensionConfig>).testTriggerMethod = TestTriggerMethod.Cli;
      });

      it('creates a commandline test run executor instance', () => {
        const karmaFactory = new KarmaFactory(framework, mockConfig, mockProcessHandler, mockProcessLog, mockLogger);
        expect(karmaFactory.createTestRunExecutor()).toBeInstanceOf(KarmaCommandLineTestRunExecutor);
      });

      it('passes along the configured karma process command to the test run executor', () => {
        expect(MockKarmaCommandLineTestRunExecutor).not.toHaveBeenCalled();

        new KarmaFactory(framework, mockConfig, mockProcessHandler, mockProcessLog, mockLogger).createTestRunExecutor();

        expect(MockKarmaCommandLineTestRunExecutor).toHaveBeenCalledTimes(1);
        expect(MockKarmaCommandLineTestRunExecutor.mock.calls[0][3]).toMatchObject({
          karmaProcessCommand: mockConfig.karmaProcessCommand
        });
      });

      it('creates the test run executor with the configured environment', () => {
        (mockConfig as Writeable<ExtensionConfig>).environment = { someEnvVar1: 'foo', someEnvVar2: 'bar' };
        expect(MockKarmaCommandLineTestRunExecutor).not.toHaveBeenCalled();

        new KarmaFactory(framework, mockConfig, mockProcessHandler, mockProcessLog, mockLogger).createTestRunExecutor();

        expect(MockKarmaCommandLineTestRunExecutor).toHaveBeenCalledTimes(1);
        expect(MockKarmaCommandLineTestRunExecutor.mock.calls[0][3]).toMatchObject({
          environment: mockConfig.environment
        });
      });

      it('creates the test run executor with the configured project root path', () => {
        (mockConfig as Writeable<ExtensionConfig>).projectRootPath = 'some/project/root/path';
        expect(MockKarmaCommandLineTestRunExecutor).not.toHaveBeenCalled();

        new KarmaFactory(framework, mockConfig, mockProcessHandler, mockProcessLog, mockLogger).createTestRunExecutor();

        expect(MockKarmaCommandLineTestRunExecutor).toHaveBeenCalledTimes(1);
        expect(MockKarmaCommandLineTestRunExecutor.mock.calls[0][0]).toBe(mockConfig.projectRootPath);
      });
    });

    describe('when the test trigger method is set to http', () => {
      beforeEach(() => {
        (mockConfig as Writeable<ExtensionConfig>).testTriggerMethod = TestTriggerMethod.Http;
      });

      it('creates an http test run executor instance', () => {
        const karmaFactory = new KarmaFactory(framework, mockConfig, mockProcessHandler, mockProcessLog, mockLogger);
        expect(karmaFactory.createTestRunExecutor()).toBeInstanceOf(KarmaHttpTestRunExecutor);
      });
    });
  });

  describe('createTestServerExecutor factory method', () => {
    describe('when a karma process executable is configured', () => {
      beforeEach(() => {
        (mockConfig as Writeable<ExtensionConfig>).karmaProcessCommand = 'path/to/some/executable';
      });

      it('creates a commandline test server executor instance', () => {
        const karmaFactory = new KarmaFactory(framework, mockConfig, mockProcessHandler, mockProcessLog, mockLogger);
        expect(karmaFactory.createTestServerExecutor()).toBeInstanceOf(KarmaCommandLineTestServerExecutor);
      });

      it('creates the test server executor to use the configured karma process executable', () => {
        expect(MockKarmaCommandLineTestServerExecutor).not.toHaveBeenCalled();

        new KarmaFactory(
          framework,
          mockConfig,
          mockProcessHandler,
          mockProcessLog,
          mockLogger
        ).createTestServerExecutor();

        expect(MockKarmaCommandLineTestServerExecutor).toHaveBeenCalledTimes(1);
        expect(MockKarmaCommandLineTestServerExecutor.mock.calls[0][5]).toMatchObject({
          karmaProcessCommand: mockConfig.karmaProcessCommand
        });
      });

      it('creates the test server executor with the configured environment', () => {
        (mockConfig as Writeable<ExtensionConfig>).environment = { someEnvVar1: 'foo', someEnvVar2: 'bar' };
        expect(MockKarmaCommandLineTestServerExecutor).not.toHaveBeenCalled();

        new KarmaFactory(
          framework,
          mockConfig,
          mockProcessHandler,
          mockProcessLog,
          mockLogger
        ).createTestServerExecutor();

        expect(MockKarmaCommandLineTestServerExecutor).toHaveBeenCalledTimes(1);
        expect(MockKarmaCommandLineTestServerExecutor.mock.calls[0][5]).toMatchObject({
          environment: mockConfig.environment
        });
      });

      it('creates the test server executor with the configured project root path', () => {
        (mockConfig as Writeable<ExtensionConfig>).projectRootPath = 'some/project/root/path';
        expect(MockKarmaCommandLineTestServerExecutor).not.toHaveBeenCalled();

        new KarmaFactory(
          framework,
          mockConfig,
          mockProcessHandler,
          mockProcessLog,
          mockLogger
        ).createTestServerExecutor();

        expect(MockKarmaCommandLineTestServerExecutor).toHaveBeenCalledTimes(1);
        expect(MockKarmaCommandLineTestServerExecutor.mock.calls[0][0]).toBe(mockConfig.projectRootPath);
      });

      it('creates the test server executor with the configured base karma config file path', () => {
        (mockConfig as Writeable<ExtensionConfig>).baseKarmaConfFilePath = 'some/base/karma/config/file/path';
        expect(MockKarmaCommandLineTestServerExecutor).not.toHaveBeenCalled();

        new KarmaFactory(
          framework,
          mockConfig,
          mockProcessHandler,
          mockProcessLog,
          mockLogger
        ).createTestServerExecutor();

        expect(MockKarmaCommandLineTestServerExecutor).toHaveBeenCalledTimes(1);
        expect(MockKarmaCommandLineTestServerExecutor.mock.calls[0][1]).toBe(mockConfig.baseKarmaConfFilePath);
      });

      it('creates the test server executor with the configured user karma config file path', () => {
        (mockConfig as Writeable<ExtensionConfig>).userKarmaConfFilePath = 'some/user/karma/config/file/path';
        expect(MockKarmaCommandLineTestServerExecutor).not.toHaveBeenCalled();

        new KarmaFactory(
          framework,
          mockConfig,
          mockProcessHandler,
          mockProcessLog,
          mockLogger
        ).createTestServerExecutor();

        expect(MockKarmaCommandLineTestServerExecutor).toHaveBeenCalledTimes(1);
        expect(MockKarmaCommandLineTestServerExecutor.mock.calls[0][2]).toBe(mockConfig.userKarmaConfFilePath);
      });
    });
  });
});
