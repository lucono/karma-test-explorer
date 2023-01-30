import { MockProxy, mock } from 'jest-mock-extended';

import { ExtensionConfig } from '../../../src/core/config/extension-config.js';
import { AngularFactory } from '../../../src/frameworks/angular/angular-factory.js';
import { AngularTestServerExecutor } from '../../../src/frameworks/angular/angular-test-server-executor.js';
import { SimpleLogger } from '../../../src/util/logging/simple-logger.js';
import { ProcessHandler } from '../../../src/util/process/process-handler.js';
import { ProcessLog } from '../../../src/util/process/process-log.js';
import { Writeable } from '../../test-util.js';

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
