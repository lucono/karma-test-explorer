import { mock, MockProxy } from 'jest-mock-extended';
import { ExtensionConfig } from '../../../src/core/config/extension-config';
import { AngularFactory } from '../../../src/frameworks/angular/angular-factory';
import { AngularTestServerExecutor } from '../../../src/frameworks/angular/angular-test-server-executor';
import { SimpleLogger } from '../../../src/util/logging/simple-logger';
import { ProcessHandler } from '../../../src/util/process/process-handler';
import { ProcessLog } from '../../../src/util/process/process-log';
import { Writeable } from '../../test-util';

describe('AngularFactory', () => {
  let mockConfig: MockProxy<ExtensionConfig>;
  let mockProcessHandler: ProcessHandler;
  let mockProcessLog: MockProxy<ProcessLog>;
  let mockLogger: MockProxy<SimpleLogger>;

  beforeEach(() => {
    mockConfig = mock<ExtensionConfig>();
    mockProcessHandler = mock<ProcessHandler>();
    mockProcessLog = mock<ProcessLog>();
    mockLogger = mock<SimpleLogger>();
  });

  describe('createTestServerExecutor factory method', () => {
    beforeEach(() => {
      (mockConfig as Writeable<ExtensionConfig>).projectName = 'randomName';
      (mockConfig as Writeable<ExtensionConfig>).projectPath = '.';
      (mockConfig as Writeable<ExtensionConfig>).projectKarmaConfigFilePath = '.';
    });

    it('creates an instance of the test executor for Angular', () => {
      const angularFactory = new AngularFactory(mockConfig, mockProcessHandler, mockProcessLog, mockLogger);
      expect(angularFactory.createTestServerExecutor()).toBeInstanceOf(AngularTestServerExecutor);
    });
  });
});
