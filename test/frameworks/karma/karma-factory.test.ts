import { MockProxy, mock } from 'jest-mock-extended';

import { TestFramework } from '../../../src/core/base/test-framework.js';
import { TestTriggerMethod } from '../../../src/core/config/extension-config.js';
import { JasmineTestFramework } from '../../../src/frameworks/jasmine/jasmine-test-framework.js';
import { KarmaFactory, KarmaFactoryConfig } from '../../../src/frameworks/karma/karma-factory.js';
import { KarmaCommandLineTestRunExecutor } from '../../../src/frameworks/karma/runner/karma-command-line-test-run-executor.js';
import { KarmaHttpTestRunExecutor } from '../../../src/frameworks/karma/runner/karma-http-test-run-executor.js';
import { KarmaCommandLineTestServerExecutor } from '../../../src/frameworks/karma/server/karma-command-line-test-server-executor.js';
import { SimpleLogger } from '../../../src/util/logging/simple-logger.js';
import { ProcessHandler } from '../../../src/util/process/process-handler.js';
import { ProcessLog } from '../../../src/util/process/process-log.js';
import { Writeable } from '../../test-util.js';

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
  let mockConfig: KarmaFactoryConfig;
  let mockProcessHandler: ProcessHandler;
  let mockProcessLog: MockProxy<ProcessLog>;
  let mockLogger: MockProxy<SimpleLogger>;

  beforeEach(() => {
    MockKarmaCommandLineTestServerExecutor.mockClear();
    MockKarmaCommandLineTestRunExecutor.mockClear();
    MockKarmaHttpTestRunExecutor.mockClear();

    framework = JasmineTestFramework;
    mockConfig = mock<KarmaFactoryConfig>();
    mockProcessHandler = mock<ProcessHandler>();
    mockProcessLog = mock<ProcessLog>();
    mockLogger = mock<SimpleLogger>();
  });

  describe('createTestRunExecutor factory method', () => {
    describe('when the test trigger method is set to Cli', () => {
      beforeEach(() => {
        (mockConfig as Writeable<KarmaFactoryConfig>).testTriggerMethod = TestTriggerMethod.Cli;
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
        (mockConfig as Writeable<KarmaFactoryConfig>).environment = { someEnvVar1: 'foo', someEnvVar2: 'bar' };
        expect(MockKarmaCommandLineTestRunExecutor).not.toHaveBeenCalled();

        new KarmaFactory(framework, mockConfig, mockProcessHandler, mockProcessLog, mockLogger).createTestRunExecutor();

        expect(MockKarmaCommandLineTestRunExecutor).toHaveBeenCalledTimes(1);
        expect(MockKarmaCommandLineTestRunExecutor.mock.calls[0][3]).toMatchObject({
          environment: mockConfig.environment
        });
      });

      it('creates the test run executor without excluded environment values', () => {
        (mockConfig as Writeable<KarmaFactoryConfig>).environment = {
          someEnvVar: 'foo',
          excludedEnvVar: 'excluded',
          otherEnvVar: 'bar'
        };
        (mockConfig as Writeable<KarmaFactoryConfig>).envExclude = ['excludedEnvVar'];

        expect(MockKarmaCommandLineTestRunExecutor).not.toHaveBeenCalled();

        new KarmaFactory(framework, mockConfig, mockProcessHandler, mockProcessLog, mockLogger).createTestRunExecutor();

        expect(MockKarmaCommandLineTestRunExecutor).toHaveBeenCalledTimes(1);

        expect(MockKarmaCommandLineTestRunExecutor.mock.calls[0][3]).toMatchObject({
          environment: {
            someEnvVar: 'foo',
            otherEnvVar: 'bar'
          }
        });
      });

      it('creates the test run executor with the configured project root path', () => {
        (mockConfig as Writeable<KarmaFactoryConfig>).projectPath = 'some/project/root/path';
        expect(MockKarmaCommandLineTestRunExecutor).not.toHaveBeenCalled();

        new KarmaFactory(framework, mockConfig, mockProcessHandler, mockProcessLog, mockLogger).createTestRunExecutor();

        expect(MockKarmaCommandLineTestRunExecutor).toHaveBeenCalledTimes(1);
        expect(MockKarmaCommandLineTestRunExecutor.mock.calls[0][0]).toBe(mockConfig.projectPath);
      });
    });

    describe('when the test trigger method is set to http', () => {
      beforeEach(() => {
        (mockConfig as Writeable<KarmaFactoryConfig>).testTriggerMethod = TestTriggerMethod.Http;
      });

      it('creates an http test run executor instance', () => {
        const karmaFactory = new KarmaFactory(framework, mockConfig, mockProcessHandler, mockProcessLog, mockLogger);
        expect(karmaFactory.createTestRunExecutor()).toBeInstanceOf(KarmaHttpTestRunExecutor);
      });
    });
  });

  describe('createTestServerExecutor factory method', () => {
    describe('when no project karma config file is configured', () => {
      beforeEach(() => {
        (mockConfig as Writeable<KarmaFactoryConfig>).projectKarmaConfigFilePath = undefined;
      });

      it('should throw an error', () => {
        const karmaFactory = new KarmaFactory(framework, mockConfig, mockProcessHandler, mockProcessLog, mockLogger);
        expect(() => karmaFactory.createTestServerExecutor()).toThrow();
      });
    });

    describe('when a project karma config file is configured', () => {
      beforeEach(() => {
        (mockConfig as Writeable<KarmaFactoryConfig>).projectKarmaConfigFilePath = 'some/path/to/project/karma.conf';
      });

      describe('and a karma process executable is configured', () => {
        beforeEach(() => {
          (mockConfig as Writeable<KarmaFactoryConfig>).karmaProcessCommand = 'path/to/some/executable';
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
          (mockConfig as Writeable<KarmaFactoryConfig>).environment = { someEnvVar1: 'foo', someEnvVar2: 'bar' };
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

        it('creates the test server executor without excluded environment values', () => {
          (mockConfig as Writeable<KarmaFactoryConfig>).environment = {
            someEnvVar: 'foo',
            excludedEnvVar: 'excluded',
            otherEnvVar: 'bar'
          };
          (mockConfig as Writeable<KarmaFactoryConfig>).envExclude = ['excludedEnvVar'];

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
            environment: {
              someEnvVar: 'foo',
              otherEnvVar: 'bar'
            }
          });
        });

        it('creates the test server executor with the configured project root path', () => {
          (mockConfig as Writeable<KarmaFactoryConfig>).projectPath = 'some/project/root/path';
          expect(MockKarmaCommandLineTestServerExecutor).not.toHaveBeenCalled();

          new KarmaFactory(
            framework,
            mockConfig,
            mockProcessHandler,
            mockProcessLog,
            mockLogger
          ).createTestServerExecutor();

          expect(MockKarmaCommandLineTestServerExecutor).toHaveBeenCalledTimes(1);
          expect(MockKarmaCommandLineTestServerExecutor.mock.calls[0][0]).toBe(mockConfig.projectPath);
        });

        it('creates the test server executor with the configured base karma config file path', () => {
          (mockConfig as Writeable<KarmaFactoryConfig>).baseKarmaConfFilePath = 'some/base/karma/config/file/path';
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
          (mockConfig as Writeable<KarmaFactoryConfig>).projectKarmaConfigFilePath = 'some/user/karma/config/file/path';
          expect(MockKarmaCommandLineTestServerExecutor).not.toHaveBeenCalled();

          new KarmaFactory(
            framework,
            mockConfig,
            mockProcessHandler,
            mockProcessLog,
            mockLogger
          ).createTestServerExecutor();

          expect(MockKarmaCommandLineTestServerExecutor).toHaveBeenCalledTimes(1);
          expect(MockKarmaCommandLineTestServerExecutor.mock.calls[0][2]).toBe(mockConfig.projectKarmaConfigFilePath);
        });
      });
    });
  });
});
