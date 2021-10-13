import { mock, MockProxy } from 'jest-mock-extended';
import { ExtensionConfig } from '../../../src/core/config/extension-config';
import { AngularFactory } from '../../../src/frameworks/angular/angular-factory';
import { AngularProject } from '../../../src/frameworks/angular/angular-project';
import { AngularTestServerExecutor } from '../../../src/frameworks/angular/angular-test-server-executor';
import { SimpleLogger } from '../../../src/util/logging/simple-logger';
import { CommandLineProcessLog } from '../../../src/util/process/command-line-process-log';
import { Writeable } from '../../test-util';

describe('AngularFactory', () => {
  let mockConfig: MockProxy<ExtensionConfig>;
  let mockAngularProject: Writeable<AngularProject>;
  let mockProcessLog: MockProxy<CommandLineProcessLog>;
  let mockLogger: MockProxy<SimpleLogger>;

  beforeEach(() => {
    mockConfig = mock<ExtensionConfig>();
    mockProcessLog = mock<CommandLineProcessLog>();
    mockLogger = mock<SimpleLogger>();

    mockAngularProject = {
      name: '',
      rootPath: '',
      karmaConfigPath: '',
      isDefaultProject: false
    };
  });

  describe('createTestServerExecutor factory method', () => {
    beforeEach(() => {
      mockAngularProject.isDefaultProject = true;
      mockAngularProject.name = 'randomName';
      mockAngularProject.rootPath = '.';
      mockAngularProject.karmaConfigPath = '.';
    });

    it('creates an instance of the test executor for Angular', () => {
      const angularFactory = new AngularFactory(mockConfig, mockAngularProject, mockProcessLog, mockLogger);
      expect(angularFactory.createTestServerExecutor()).toBeInstanceOf(AngularTestServerExecutor);
    });
  });
});
