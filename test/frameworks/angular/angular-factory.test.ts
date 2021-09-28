import { mock, MockProxy } from 'jest-mock-extended';
import { ExtensionConfig } from '../../../src/core/config/extension-config';
import { Notifications } from '../../../src/core/vscode/notifications';
import { AngularFactory } from '../../../src/frameworks/angular/angular-factory';
import { AngularProject } from '../../../src/frameworks/angular/angular-project';
import { AngularTestServerExecutor } from '../../../src/frameworks/angular/angular-test-server-executor';
import { getDefaultAngularProject } from '../../../src/frameworks/angular/angular-util';
import { SimpleLogger } from '../../../src/util/logging/simple-logger';
import { CommandLineProcessLog } from '../../../src/util/process/command-line-process-log';

jest.mock('../../../src/frameworks/angular/angular-util');
const mockGetDefaultAngularProject = getDefaultAngularProject as jest.MockedFunction<typeof getDefaultAngularProject>;

describe('AngularFactory', () => {
  let mockConfig: MockProxy<ExtensionConfig>;
  let mockNotifications: MockProxy<Notifications>;
  let mockProcessLog: MockProxy<CommandLineProcessLog>;
  let mockLogger: MockProxy<SimpleLogger>;

  beforeEach(() => {
    mockGetDefaultAngularProject.mockClear();
    mockConfig = mock<ExtensionConfig>();
    mockNotifications = mock<Notifications>();
    mockProcessLog = mock<CommandLineProcessLog>();
    mockLogger = mock<SimpleLogger>();
  });

  describe('createTestServerExecutor factory method', () => {
    let mockAngularProject: AngularProject;

    beforeEach(() => {
      mockAngularProject = { isDefaultProject: true, name: 'randomName', rootPath: '.', karmaConfigPath: '.' };
      mockGetDefaultAngularProject.mockReturnValue(mockAngularProject);
    });

    it('creates an instance of the test executor for Angular', () => {
      const angularFactory = new AngularFactory(mockConfig, mockNotifications, mockProcessLog, mockLogger);
      expect(angularFactory.createTestServerExecutor()).toBeInstanceOf(AngularTestServerExecutor);
    });
  });
});
