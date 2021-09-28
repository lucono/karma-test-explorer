import { mock, MockProxy } from 'jest-mock-extended';
import { TestFramework } from '../../../src/core/base/test-framework';
import { ExtensionConfig } from '../../../src/core/config/extension-config';
import { JasmineTestFramework } from '../../../src/frameworks/jasmine/jasmine-test-framework';
import { KarmaFactory } from '../../../src/frameworks/karma/karma-factory';
import { KarmaCommandLineTestRunExecutor } from '../../../src/frameworks/karma/runner/karma-command-line-test-run-executor';
import { KarmaHttpTestRunExecutor } from '../../../src/frameworks/karma/runner/karma-http-test-run-executor';
import { SimpleLogger } from '../../../src/util/logging/simple-logger';
import { CommandLineProcessLog } from '../../../src/util/process/command-line-process-log';
import { Writeable } from '../../test-util';

jest.mock('../../../src/frameworks/karma/runner/karma-command-line-test-run-executor');
jest.mock('../../../src/frameworks/karma/runner/karma-http-test-run-executor');

const MockKarmaCommandLineTestRunExecutor = KarmaCommandLineTestRunExecutor as jest.MockedClass<
  typeof KarmaCommandLineTestRunExecutor
>;
const MockKarmaHttpTestRunExecutor = KarmaHttpTestRunExecutor as jest.MockedClass<typeof KarmaHttpTestRunExecutor>;

describe('KarmaFactory', () => {
  let framework: TestFramework;
  let mockConfig: ExtensionConfig;
  let mockProcessLog: MockProxy<CommandLineProcessLog>;
  let mockLogger: MockProxy<SimpleLogger>;

  beforeEach(() => {
    MockKarmaCommandLineTestRunExecutor.mockClear();
    MockKarmaHttpTestRunExecutor.mockClear();

    framework = JasmineTestFramework;
    mockConfig = {} as ExtensionConfig;
    mockProcessLog = mock<CommandLineProcessLog>();
    mockLogger = mock<SimpleLogger>();
  });

  describe('createTestRunExecutor factory method', () => {
    describe('when a karma process executable is configured', () => {
      beforeEach(() => {
        (mockConfig as Writeable<ExtensionConfig>).karmaProcessExecutable = 'path/to/some/executable';
      });

      it('creates a commandline test run executor instance', () => {
        const karmaFactory = new KarmaFactory(framework, mockConfig, mockProcessLog, mockLogger);
        expect(karmaFactory.createTestRunExecutor()).toBeInstanceOf(KarmaCommandLineTestRunExecutor);
      });

      it('creates the test run executor to use the configured karma process executable', () => {
        expect(MockKarmaCommandLineTestRunExecutor).not.toHaveBeenCalled();

        new KarmaFactory(framework, mockConfig, mockProcessLog, mockLogger).createTestRunExecutor();

        expect(MockKarmaCommandLineTestRunExecutor).toHaveBeenCalledTimes(1);
        expect(MockKarmaCommandLineTestRunExecutor.mock.calls[0][3]).toMatchObject({
          karmaProcessCommand: mockConfig.karmaProcessExecutable
        });
      });

      it('creates the test run executor with the configured environment', () => {
        (mockConfig as Writeable<ExtensionConfig>).environment = { someEnvVar1: 'foo', someEnvVar2: 'bar' };
        expect(MockKarmaCommandLineTestRunExecutor).not.toHaveBeenCalled();

        new KarmaFactory(framework, mockConfig, mockProcessLog, mockLogger).createTestRunExecutor();

        expect(MockKarmaCommandLineTestRunExecutor).toHaveBeenCalledTimes(1);
        expect(MockKarmaCommandLineTestRunExecutor.mock.calls[0][3]).toMatchObject({
          environment: mockConfig.environment
        });
      });

      it('creates the test run executor with the configured project root path', () => {
        (mockConfig as Writeable<ExtensionConfig>).projectRootPath = 'some/project/root/path';
        expect(MockKarmaCommandLineTestRunExecutor).not.toHaveBeenCalled();

        new KarmaFactory(framework, mockConfig, mockProcessLog, mockLogger).createTestRunExecutor();

        expect(MockKarmaCommandLineTestRunExecutor).toHaveBeenCalledTimes(1);
        expect(MockKarmaCommandLineTestRunExecutor.mock.calls[0][0]).toBe(mockConfig.projectRootPath);
      });

      it('creates the test run executor with the configured base karma config file path', () => {
        (mockConfig as Writeable<ExtensionConfig>).baseKarmaConfFilePath = 'some/base/karma/config/file/path';
        expect(MockKarmaCommandLineTestRunExecutor).not.toHaveBeenCalled();

        new KarmaFactory(framework, mockConfig, mockProcessLog, mockLogger).createTestRunExecutor();

        expect(MockKarmaCommandLineTestRunExecutor).toHaveBeenCalledTimes(1);
        expect(MockKarmaCommandLineTestRunExecutor.mock.calls[0][1]).toBe(mockConfig.baseKarmaConfFilePath);
      });

      it('creates the test run executor with the configured user karma config file path', () => {
        (mockConfig as Writeable<ExtensionConfig>).userKarmaConfFilePath = 'some/user/karma/config/file/path';
        expect(MockKarmaCommandLineTestRunExecutor).not.toHaveBeenCalled();

        new KarmaFactory(framework, mockConfig, mockProcessLog, mockLogger).createTestRunExecutor();

        expect(MockKarmaCommandLineTestRunExecutor).toHaveBeenCalledTimes(1);
        expect(MockKarmaCommandLineTestRunExecutor.mock.calls[0][2]).toBe(mockConfig.userKarmaConfFilePath);
      });
    });

    describe('when no karma process executable is configured', () => {
      beforeEach(() => {
        (mockConfig as Writeable<ExtensionConfig>).karmaProcessExecutable = '';
      });

      it('creates an http test run executor instance', () => {
        const karmaFactory = new KarmaFactory(framework, mockConfig, mockProcessLog, mockLogger);
        expect(karmaFactory.createTestRunExecutor()).toBeInstanceOf(KarmaHttpTestRunExecutor);
      });
    });
  });
});
