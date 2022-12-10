import { mock, MockProxy } from 'jest-mock-extended';
import { getAngularWorkspaceInfo } from '../../../src/frameworks/angular/angular-util';
import { FileHandler } from '../../../src/util/filesystem/file-handler';
import { Logger } from '../../../src/util/logging/logger';
import { normalizePath } from '../../../src/util/utils';

describe('Angular Utils', () => {
  let mockFileHandler: MockProxy<FileHandler>;
  let mockLogger: MockProxy<Logger>;

  beforeEach(() => {
    mockFileHandler = mock<FileHandler>();
    mockLogger = mock<Logger>();
  });

  describe('getAngularWorkspaceInfo', () => {
    const { platform, angularConfigRootPath } =
      process.platform === 'win32'
        ? { platform: 'Windows', angularConfigRootPath: 'C:\\angular-config-root-path' }
        : { platform: 'Unix', angularConfigRootPath: '/angular-config-root-path' };

    it(`should check for an 'angular.json' config file in the specified config root path (${platform})`, () => {
      mockFileHandler.existsSync.mockReturnValue(false);
      const expectedAngularConfigFile = normalizePath(`${angularConfigRootPath}/angular.json`);
      getAngularWorkspaceInfo(angularConfigRootPath, mockFileHandler, mockLogger);

      expect(mockFileHandler.existsSync).toHaveBeenCalledWith(expectedAngularConfigFile);
    });

    it(`should check for an '.angular-cli.json' config file in the specified config root path (${platform})`, () => {
      mockFileHandler.existsSync.mockReturnValue(false);
      const expectedAngularCliConfigFile = normalizePath(`${angularConfigRootPath}/.angular-cli.json`);
      getAngularWorkspaceInfo(angularConfigRootPath, mockFileHandler, mockLogger);

      expect(mockFileHandler.existsSync).toHaveBeenCalledWith(expectedAngularCliConfigFile);
    });

    it(`should return undefined when neither angular config exists in the config root path (${platform})`, () => {
      mockFileHandler.existsSync.mockReturnValue(false);
      const result = getAngularWorkspaceInfo(angularConfigRootPath, mockFileHandler, mockLogger);
      expect(result).toBeUndefined();
    });

    it(`should return undefined when the angular config is invalid (${platform})`, () => {
      mockFileHandler.existsSync.mockReturnValue(true);
      mockFileHandler.readFileSync.mockReturnValue('invalid');
      const result = getAngularWorkspaceInfo(angularConfigRootPath, mockFileHandler, mockLogger);
      expect(result).toBeUndefined();
    });

    it(`should successfully get project info from a valid 'angular.json' config file in the config root path (${platform})`, () => {
      const angularConfigFile = normalizePath(`${angularConfigRootPath}/angular.json`);
      mockFileHandler.existsSync.calledWith(angularConfigFile).mockReturnValue(true);

      mockFileHandler.readFileSync.calledWith(angularConfigFile).mockReturnValue(
        JSON.stringify({
          // defaultProject: 'default-project', // deprecated!
          projects: {
            'project-1': {
              root: 'project-1',
              architect: {
                test: {
                  options: {
                    karmaConfig: 'project-1/karma.conf.js'
                  }
                }
              }
            },
            'project-2': {
              root: 'project-2',
              architect: {
                test: {
                  options: {
                    karmaConfig: 'project-2/karma.conf.js'
                  }
                }
              }
            },
            'project-3': {
              root: 'project-3',
              architect: {}
            }
          }
        })
      );

      const workspaceInfoResult = getAngularWorkspaceInfo(angularConfigRootPath, mockFileHandler, mockLogger);

      expect(workspaceInfoResult).toBeDefined();
      expect(workspaceInfoResult!.projects).toHaveLength(3);

      expect(workspaceInfoResult!.projects[0].name).toEqual('project-1');
      expect(workspaceInfoResult!.projects[0].rootPath).toEqual(normalizePath(`${angularConfigRootPath}/project-1`));
      expect(workspaceInfoResult!.projects[0].karmaConfigPath).toEqual(
        normalizePath(`${angularConfigRootPath}/project-1/karma.conf.js`)
      );

      expect(workspaceInfoResult!.projects[1].name).toEqual('project-2');
      expect(workspaceInfoResult!.projects[1].rootPath).toEqual(normalizePath(`${angularConfigRootPath}/project-2`));
      expect(workspaceInfoResult!.projects[1].karmaConfigPath).toEqual(
        normalizePath(`${angularConfigRootPath}/project-2/karma.conf.js`)
      );

      expect(workspaceInfoResult!.projects[2].name).toEqual('project-3');
      expect(workspaceInfoResult!.projects[2].rootPath).toEqual(normalizePath(`${angularConfigRootPath}/project-3`));
      expect(workspaceInfoResult!.projects[2].karmaConfigPath).toBeUndefined();

      expect(workspaceInfoResult!.defaultProject).toEqual(workspaceInfoResult!.projects[0]);
    });

    it(`should successfully get project info from a valid '.angular-cli.json' config file in the config root path (${platform})`, () => {
      const angularCliConfigFile = normalizePath(`${angularConfigRootPath}/.angular-cli.json`);
      mockFileHandler.existsSync.calledWith(angularCliConfigFile).mockReturnValue(true);

      mockFileHandler.readFileSync.calledWith(angularCliConfigFile).mockReturnValue(
        JSON.stringify({
          project: {
            name: 'my-app'
          },
          apps: [
            {
              root: 'src-1'
            },
            {
              name: 'my-app-2',
              root: 'src-2'
            }
          ],
          test: {
            karma: {
              config: './karma.conf.js'
            }
          }
        })
      );

      const workspaceInfoResult = getAngularWorkspaceInfo(angularConfigRootPath, mockFileHandler, mockLogger);

      expect(workspaceInfoResult).toBeDefined();
      expect(workspaceInfoResult!.projects).toHaveLength(2);

      expect(workspaceInfoResult!.projects[0].name).toEqual('my-app');
      expect(workspaceInfoResult!.projects[0].rootPath).toEqual(normalizePath(`${angularConfigRootPath}/src-1`));
      expect(workspaceInfoResult!.projects[0].karmaConfigPath).toEqual(
        normalizePath(`${angularConfigRootPath}/karma.conf.js`)
      );

      expect(workspaceInfoResult!.projects[1].name).toEqual('my-app-2');
      expect(workspaceInfoResult!.projects[1].rootPath).toEqual(normalizePath(`${angularConfigRootPath}/src-2`));
      expect(workspaceInfoResult!.projects[1].karmaConfigPath).toEqual(
        normalizePath(`${angularConfigRootPath}/karma.conf.js`)
      );

      expect(workspaceInfoResult!.defaultProject).toEqual(workspaceInfoResult!.projects[0]);
    });
  });
});
