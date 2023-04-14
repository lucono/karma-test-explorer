import { MockProxy, mock } from 'jest-mock-extended';

import { AngularFactory, AngularFactoryConfig } from '../../../src/frameworks/angular/angular-factory.js';
import { AngularTestServerExecutor } from '../../../src/frameworks/angular/angular-test-server-executor.js';
import { SimpleLogger } from '../../../src/util/logging/simple-logger.js';
import { ProcessHandler } from '../../../src/util/process/process-handler.js';
import { ProcessLog } from '../../../src/util/process/process-log.js';
import { Writeable } from '../../test-util.js';

jest.mock('../../../src/frameworks/angular/angular-test-server-executor');

const MockAngularTestServerExecutor = AngularTestServerExecutor as jest.MockedClass<typeof AngularTestServerExecutor>;

describe('AngularFactory', () => {
  let mockConfig: MockProxy<AngularFactoryConfig>;
  let mockProcessHandler: ProcessHandler;
  let mockProcessLog: MockProxy<ProcessLog>;
  let mockLogger: MockProxy<SimpleLogger>;

  beforeEach(() => {
    MockAngularTestServerExecutor.mockClear();

    mockConfig = mock<AngularFactoryConfig>();
    mockProcessHandler = mock<ProcessHandler>();
    mockProcessLog = mock<ProcessLog>();
    mockLogger = mock<SimpleLogger>();
  });

  describe('createTestServerExecutor factory method', () => {
    beforeEach(() => {
      (mockConfig as Writeable<AngularFactoryConfig>).projectName = 'randomName';
      (mockConfig as Writeable<AngularFactoryConfig>).projectPath = '.';
      (mockConfig as Writeable<AngularFactoryConfig>).projectKarmaConfigFilePath = '.';
    });

    it('creates an instance of the test executor for Angular', () => {
      const angularFactory = new AngularFactory(mockConfig, mockProcessHandler, mockProcessLog, mockLogger);
      expect(angularFactory.createTestServerExecutor()).toBeInstanceOf(AngularTestServerExecutor);
    });

    it('creates the test server executor with the configured environment', () => {
      (mockConfig as Writeable<AngularFactoryConfig>).environment = { someEnvVar1: 'foo', someEnvVar2: 'bar' };
      expect(MockAngularTestServerExecutor).not.toHaveBeenCalled();

      new AngularFactory(mockConfig, mockProcessHandler, mockProcessLog, mockLogger).createTestServerExecutor();

      expect(MockAngularTestServerExecutor).toHaveBeenCalledTimes(1);
      expect(MockAngularTestServerExecutor.mock.calls[0][7]).toMatchObject({
        environment: mockConfig.environment
      });
    });

    it('creates the test server executor without excluded environment values', () => {
      (mockConfig as Writeable<AngularFactoryConfig>).environment = {
        someEnvVar: 'foo',
        excludedEnvVar: 'excluded',
        otherEnvVar: 'bar'
      };
      (mockConfig as Writeable<AngularFactoryConfig>).envExclude = ['excludedEnvVar'];

      expect(MockAngularTestServerExecutor).not.toHaveBeenCalled();

      new AngularFactory(mockConfig, mockProcessHandler, mockProcessLog, mockLogger).createTestServerExecutor();

      expect(MockAngularTestServerExecutor).toHaveBeenCalledTimes(1);

      expect(MockAngularTestServerExecutor.mock.calls[0][7]).toMatchObject({
        environment: {
          someEnvVar: 'foo',
          otherEnvVar: 'bar'
        }
      });
    });
  });
});
