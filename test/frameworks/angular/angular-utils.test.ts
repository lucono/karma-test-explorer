import { getAngularWorkspaceInfo } from '../../../src/frameworks/angular/angular-util';
import { normalizePath } from '../../../src/util/utils';

jest.mock('fs');
const fs = require('fs'); // require necessary for jest to work

const logger = {
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  trace: jest.fn(),
  dispose: jest.fn()
};

describe('angular-utils.getAngularWorkspaceInfo', () => {
  const angularConfigRootPaths = [
    ['Unix', '/angular-config-root-path'],
    ['Windows', 'C:\\angular-config-root-path']
  ];

  beforeEach(jest.clearAllMocks);

  angularConfigRootPaths.forEach(item => {
    const [platform, angularConfigRootPath] = item;

    it(`should return undefined if no angular definition exists (${platform})`, () => {
      fs.existsSync.mockReturnValue(false);
      const result = getAngularWorkspaceInfo(angularConfigRootPath, logger);
      expect(result).toBeUndefined();
      expect(fs.existsSync).toHaveBeenCalledWith(normalizePath(`${angularConfigRootPath}/angular.json`));
      expect(fs.existsSync).toHaveBeenCalledWith(normalizePath(`${angularConfigRootPath}/.angular-cli.json`));
    });

    it(`should return undefined if the angular definitions are invalid (${platform})`, () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation(() => 'invalid json');
      const result = getAngularWorkspaceInfo(angularConfigRootPath, logger);
      expect(result).toBeUndefined();
      expect(fs.existsSync).toHaveBeenCalledWith(normalizePath(`${angularConfigRootPath}/angular.json`));
      expect(fs.existsSync).toHaveBeenCalledWith(normalizePath(`${angularConfigRootPath}/.angular-cli.json`));
      expect(fs.readFileSync).toHaveBeenCalledWith(normalizePath(`${angularConfigRootPath}/angular.json`), 'utf-8');
      expect(fs.readFileSync).toHaveBeenCalledWith(
        normalizePath(`${angularConfigRootPath}/.angular-cli.json`),
        'utf-8'
      );
    });

    it('should return a valid configuration from angular.json', () => {
      fs.existsSync.mockImplementation((name: any) => (name as string).endsWith('angular.json'));
      fs.readFileSync.mockImplementation(() =>
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
      const result = getAngularWorkspaceInfo(angularConfigRootPath, logger);
      expect(result).toBeDefined();
      expect(result!.defaultProject).toEqual(result!.projects[0]);
      expect(result!.projects.length).toBe(2);
      expect(result!.projects[0].name).toBe('project-1');
      expect(result!.projects[0].rootPath).toBe(normalizePath(angularConfigRootPath + '/project-1'));
      expect(result!.projects[0].karmaConfigPath).toBe(
        normalizePath(angularConfigRootPath + '/project-1/karma.conf.js')
      );
      expect(result!.projects[1].name).toBe('project-2');
      expect(result!.projects[1].rootPath).toBe(normalizePath(angularConfigRootPath + '/project-2'));
      expect(result!.projects[1].karmaConfigPath).toBe(
        normalizePath(angularConfigRootPath + '/project-2/karma.conf.js')
      );
    });

    it('should return a valid configuration from .angular-cli.json', () => {
      fs.existsSync.mockImplementation((name: any) => (name as string).endsWith('.angular-cli.json'));
      fs.readFileSync.mockImplementation(() =>
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
      const result = getAngularWorkspaceInfo(angularConfigRootPath, logger);
      expect(result).toBeDefined();
      expect(result!.defaultProject).toEqual(result!.projects[0]);
      expect(result!.projects.length).toBe(2);
      expect(result!.projects[0].name).toBe('my-app');
      expect(result!.projects[0].rootPath).toBe(normalizePath(angularConfigRootPath + '/src-1'));
      expect(result!.projects[0].karmaConfigPath).toBe(normalizePath(angularConfigRootPath + '/karma.conf.js'));
      expect(result!.projects[1].name).toBe('my-app-2');
      expect(result!.projects[1].rootPath).toBe(normalizePath(angularConfigRootPath + '/src-2'));
      expect(result!.projects[1].karmaConfigPath).toBe(normalizePath(angularConfigRootPath + '/karma.conf.js'));
    });
  });
});
