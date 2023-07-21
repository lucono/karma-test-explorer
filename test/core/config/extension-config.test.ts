import { DebugConfiguration } from 'vscode';

import { MockProxy, mock } from 'jest-mock-extended';
import { CustomLauncher } from 'karma';

import { GeneralConfigSetting } from '../../../src/core/config/config-setting.js';
import { ConfigStore } from '../../../src/core/config/config-store.js';
import { ExtensionConfig } from '../../../src/core/config/extension-config.js';
import { FileHandler } from '../../../src/util/filesystem/file-handler.js';
import { Logger } from '../../../src/util/logging/logger.js';
import { asExtensionConfigWithUnixStylePaths as withUnixPaths } from '../../test-util.js';

describe('ExtensionConfig', () => {
  let mockLogger: MockProxy<Logger>;
  let mockFileHandler: MockProxy<FileHandler>;
  let mockConfigValues: Map<string, any>;
  let mockConfigDefaults: Map<string, any>;
  let mockConfigStore: ConfigStore;

  beforeEach(() => {
    mockLogger = mock<Logger>();
    mockFileHandler = mock<FileHandler>();
    mockConfigValues = new Map();
    mockConfigDefaults = new Map();

    mockConfigValues.set(GeneralConfigSetting.TestFiles, []);
    mockConfigValues.set(GeneralConfigSetting.ExcludeFiles, []);
    mockConfigValues.set(GeneralConfigSetting.ReloadOnChangedFiles, []);

    mockConfigStore = {
      has: key => mockConfigValues.has(key),
      get: key => (mockConfigValues.has(key) ? mockConfigValues.get(key) : mockConfigDefaults.get(key) ?? ''),
      inspect: key => ({
        key: key,
        ...(mockConfigDefaults.has(key) ? { defaultValue: mockConfigDefaults.get(key) } : {}),
        ...(mockConfigValues.has(key) ? { workspaceValue: mockConfigValues.get(key) } : {})
      })
    };
  });

  describe('`browser` setting', () => {
    beforeEach(() => {
      mockConfigValues.set(GeneralConfigSetting.Browser, 'Chrome');
    });

    it('does not set a default debug port', () => {
      const extensionConfig = withUnixPaths(
        new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
      );
      expect(extensionConfig.defaultDebugPort).toEqual(undefined);
    });

    it('sets the user override flag', () => {
      const extensionConfig = withUnixPaths(
        new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
      );

      expect(extensionConfig.userSpecifiedLaunchConfig).toBe(true);
    });
  });

  describe('`customLauncher` setting', () => {
    let customLauncherConfig: CustomLauncher;
    let customLauncherConfigDefault: CustomLauncher;

    beforeEach(() => {
      customLauncherConfig = { base: '', flags: [] };
      mockConfigValues.set(GeneralConfigSetting.CustomLauncher, customLauncherConfig);

      customLauncherConfigDefault = { base: 'Chrome', flags: [] };
      mockConfigDefaults.set(GeneralConfigSetting.CustomLauncher, customLauncherConfigDefault);
    });

    describe('when has a `base` that is supported by Chrome', () => {
      beforeEach(() => {
        customLauncherConfig.base = customLauncherConfigDefault.base;
      });

      describe('and the `debuggerConfig` setting', () => {
        let debuggerConfig: DebugConfiguration;
        let debuggerConfigDefault: DebugConfiguration;

        beforeEach(() => {
          debuggerConfig = { name: '', type: '', request: '' };
          mockConfigValues.set(GeneralConfigSetting.DebuggerConfig, debuggerConfig);

          debuggerConfigDefault = { name: '', type: 'chrome', request: '' };
          mockConfigDefaults.set(GeneralConfigSetting.DebuggerConfig, debuggerConfigDefault);
        });

        describe('has a `type` that is supported by Chrome', () => {
          beforeEach(() => {
            debuggerConfig.type = debuggerConfigDefault.type;
          });

          it('uses the `remote-debugging-port` launcher flag value as the default debug port if present', () => {
            customLauncherConfig.flags = ['--remote-debugging-port=1234'];

            const extensionConfig = withUnixPaths(
              new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
            );
            expect(extensionConfig.defaultDebugPort).toEqual(1234);
          });

          it('uses port 9222 as the default debug port if `remote-debugging-port` launcher flag is not present', () => {
            customLauncherConfig.flags = [];

            const extensionConfig = withUnixPaths(
              new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
            );
            expect(extensionConfig.defaultDebugPort).toEqual(9222);
          });
        });

        describe('has a `type` that is not supported by Chrome', () => {
          beforeEach(() => {
            debuggerConfig.type = 'fake-debugger-type';
          });

          it('does not set a default debug port if the `remote-debugging-port` launcher flag is present', () => {
            customLauncherConfig.flags = ['--remote-debugging-port=1234'];

            const extensionConfig = withUnixPaths(
              new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
            );
            expect(extensionConfig.defaultDebugPort).not.toBeDefined();
          });

          it('does not default to port 9222 if the `remote-debugging-port` launcher flag is not present', () => {
            customLauncherConfig.flags = [];

            const extensionConfig = withUnixPaths(
              new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
            );
            expect(extensionConfig.defaultDebugPort).not.toBeDefined();
          });
        });
      });
    });

    describe('when has a `base` that is supported by Firefox', () => {
      beforeEach(() => {
        customLauncherConfig.base = 'Firefox';
      });

      describe('and the `debuggerConfig` setting', () => {
        let debuggerConfig: DebugConfiguration;
        let debuggerConfigDefault: DebugConfiguration;

        beforeEach(() => {
          debuggerConfig = { name: '', type: '', request: '' };
          mockConfigValues.set(GeneralConfigSetting.DebuggerConfig, debuggerConfig);

          debuggerConfigDefault = { name: '', type: 'firefox', request: '' };
          mockConfigDefaults.set(GeneralConfigSetting.DebuggerConfig, debuggerConfigDefault);
        });

        describe('has a `type` that is supported by Firefox', () => {
          beforeEach(() => {
            debuggerConfig.type = debuggerConfigDefault.type;
          });

          it('uses the `start-debugger-server` launcher flag value as the default debug port if present', () => {
            customLauncherConfig.flags = ['-start-debugger-server=1234'];

            const extensionConfig = withUnixPaths(
              new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
            );
            expect(extensionConfig.defaultDebugPort).toEqual(1234);
          });

          it('uses port 9222 as the default debug port if `start-debugger-server` launcher flag is not present', () => {
            customLauncherConfig.flags = [];

            const extensionConfig = withUnixPaths(
              new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
            );
            expect(extensionConfig.defaultDebugPort).toEqual(9222);
          });
        });

        describe('has a `type` that is not supported by Firefox', () => {
          beforeEach(() => {
            debuggerConfig.type = 'fake-debugger-type';
          });

          it('does not set a default debug port if the `start-debugger-server` launcher flag is present', () => {
            customLauncherConfig.flags = ['-start-debugger-server=1234'];

            const extensionConfig = withUnixPaths(
              new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
            );
            expect(extensionConfig.defaultDebugPort).not.toBeDefined();
          });

          it('does not default to port 9222 if the `start-debugger-server` launcher flag is not present', () => {
            customLauncherConfig.flags = [];

            const extensionConfig = withUnixPaths(
              new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
            );
            expect(extensionConfig.defaultDebugPort).not.toBeDefined();
          });
        });
      });
    });

    describe('when has a `base` that is not supported', () => {
      beforeEach(() => {
        customLauncherConfig.base = 'differentDefaultBaseLauncherName';
      });

      it('does not set a default debug port if the `remote-debugging-port` launcher flag is present', () => {
        customLauncherConfig.flags = ['--remote-debugging-port=1234'];
        const extensionConfig = withUnixPaths(
          new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
        );

        expect(extensionConfig.defaultDebugPort).not.toBeDefined();
      });

      it('does not set a default debug port if the `start-debugger-server` launcher flag is present', () => {
        customLauncherConfig.flags = ['-start-debugger-server=1234'];
        const extensionConfig = withUnixPaths(
          new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
        );

        expect(extensionConfig.defaultDebugPort).not.toBeDefined();
      });

      it('does not default to port 9222 if no launcher flags are present', () => {
        customLauncherConfig.flags = [];
        const extensionConfig = withUnixPaths(
          new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
        );

        expect(extensionConfig.defaultDebugPort).not.toBeDefined();
      });
    });

    it('sets the user override flag', () => {
      const extensionConfig = withUnixPaths(
        new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
      );

      expect(extensionConfig.userSpecifiedLaunchConfig).toBe(true);
    });
  });

  describe('no `browser` or `customLauncher` setting', () => {
    describe('and the karma config contains a supported browser', () => {
      beforeEach(() => {
        mockFileHandler.readFileSync.mockReturnValue(`
          module.exports = function (config) {
            config.set({
              browsers: ['Electron'],
            });
          };
        `);
      });

      it('sets the custom launcher as the default for the custom launcher browser', () => {
        const extensionConfig = withUnixPaths(
          new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
        );
        expect(extensionConfig.customLauncher.base).toEqual('Electron');
      });

      it('uses port 9222 as the default debug port', () => {
        const extensionConfig = withUnixPaths(
          new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
        );
        expect(extensionConfig.defaultDebugPort).toEqual(9222);
      });
    });

    describe('and the karma config does not contain a supported browser', () => {
      describe('and does contain a parseable supported browser custom launcher', () => {
        beforeEach(() => {
          mockFileHandler.readFileSync.mockReturnValue(`
            module.exports = function (config) {
              config.set({
                browsers: ['MyBrowser'],
                customLaunchers: {
                  MyBrowser: {
                    base: 'Firefox',
                    flags: [
                      '-headless',
                      '-start-debugger-server=1234'
                    ],
                    prefs: {
                      'devtools.debugger.remote-enabled': true,
                      'devtools.chrome.enabled': true,
                      'devtools.debugger.prompt-connection': false
                    }
                  }
                }
              });
            };
          `);
        });

        it('sets the custom launcher as the default for the custom launcher browser', () => {
          const extensionConfig = withUnixPaths(
            new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
          );
          expect(extensionConfig.customLauncher.base).toEqual('Firefox');
        });

        it('uses port 9222 as the default debug port', () => {
          const extensionConfig = withUnixPaths(
            new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
          );
          expect(extensionConfig.defaultDebugPort).toEqual(9222);
        });
      });

      describe('and does not contain a parseable supported browser custom launcher', () => {
        beforeEach(() => {
          mockFileHandler.readFileSync.mockReturnValue(`
            const customLauncher = {
              base: 'Firefox',
              flags: [
                '-headless',
                '-start-debugger-server=1234'
              ],
              prefs: {
                'devtools.debugger.remote-enabled': true,
                'devtools.chrome.enabled': true,
                'devtools.debugger.prompt-connection': false
              }
            };
            module.exports = function (config) {
              config.set({
                browsers: ['MyBrowser'],
                customLaunchers: {
                  MyBrowser: customLauncher
                }
              });
            };
          `);
        });

        it('sets the custom launcher as the default browser', () => {
          const extensionConfig = withUnixPaths(
            new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
          );
          expect(extensionConfig.customLauncher.base).toEqual('Chrome');
        });

        it('uses port 9222 as the default debug port', () => {
          const extensionConfig = withUnixPaths(
            new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
          );
          expect(extensionConfig.defaultDebugPort).toEqual(9222);
        });
      });
    });

    it('does not set the user override flag', () => {
      const extensionConfig = withUnixPaths(
        new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
      );

      expect(extensionConfig.userSpecifiedLaunchConfig).toBe(false);
    });
  });

  describe('when the `containerMode` setting is `enabled`', () => {
    beforeEach(() => {
      mockConfigValues.set(GeneralConfigSetting.ContainerMode, 'enabled');
    });

    describe('and a custom launcher', () => {
      let customLauncherConfig: CustomLauncher;

      beforeEach(() => {
        customLauncherConfig = { base: '', flags: [] };
        mockConfigValues.set(GeneralConfigSetting.CustomLauncher, customLauncherConfig);
      });

      describe('is configured with a base launcher name that is supported by the chrome browser helper', () => {
        beforeEach(() => {
          customLauncherConfig.base = 'ChromiumHeadless';
        });

        it('adds a `--no-sandbox` flag to the launcher', () => {
          customLauncherConfig.flags = ['some-random-flag'];

          const extensionConfig = withUnixPaths(
            new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
          );
          expect(extensionConfig.customLauncher).toEqual(
            expect.objectContaining({ flags: ['some-random-flag', '--no-sandbox'] })
          );
        });

        it('does not add duplicate `--no-sandbox` flag when the configured launcher already has the flag', () => {
          customLauncherConfig.flags = ['--no-sandbox', 'random-other-flag'];

          const extensionConfig = withUnixPaths(
            new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
          );
          expect(extensionConfig.customLauncher).toEqual(
            expect.objectContaining({ flags: ['--no-sandbox', 'random-other-flag'] })
          );
        });

        it('does not remove the `--headless` flag when non headless mode is enabled', () => {
          mockConfigValues.set(GeneralConfigSetting.NonHeadlessModeEnabled, true);

          customLauncherConfig.flags = ['--no-sandbox', '--headless'];

          const extensionConfig = withUnixPaths(
            new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
          );
          expect(extensionConfig.customLauncher).toEqual(
            expect.objectContaining({ flags: ['--no-sandbox', '--headless'] })
          );
        });
      });

      describe('is configured with a base launcher name that is supported by the Firefox browser helper', () => {
        beforeEach(() => {
          customLauncherConfig.base = 'FirefoxNightly';
        });

        it('does not add a `--no-sandbox` flag to the launcher', () => {
          customLauncherConfig.flags = ['some-random-flag'];

          const extensionConfig = withUnixPaths(
            new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
          );
          expect(extensionConfig.customLauncher).toEqual(expect.objectContaining({ flags: ['some-random-flag'] }));
        });

        it('does not remove the `-headless` flag when non headless mode is enabled', () => {
          mockConfigValues.set(GeneralConfigSetting.NonHeadlessModeEnabled, true);

          customLauncherConfig.flags = ['-headless'];

          const extensionConfig = withUnixPaths(
            new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
          );
          expect(extensionConfig.customLauncher).toEqual(expect.objectContaining({ flags: ['-headless'] }));
        });
      });

      describe('is configured with a base launcher name that is supported by the Electron browser helper', () => {
        beforeEach(() => {
          customLauncherConfig.base = 'Electron';
        });

        it('does not add a `--no-sandbox` flag to the launcher', () => {
          customLauncherConfig.flags = ['some-random-flag'];

          const extensionConfig = withUnixPaths(
            new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
          );
          expect(extensionConfig.customLauncher).toEqual(expect.objectContaining({ flags: ['some-random-flag'] }));
        });

        it('does not configure the show parameter when non headless mode is enabled', () => {
          mockConfigValues.set(GeneralConfigSetting.NonHeadlessModeEnabled, true);

          const extensionConfig = withUnixPaths(
            new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
          );
          expect(extensionConfig.customLauncher).not.toEqual(
            expect.objectContaining({
              browserWindowOptions: {
                webPreferences: {
                  show: true
                }
              }
            })
          );
        });
      });

      describe('is configured with a base launcher name that is not supported', () => {
        beforeEach(() => {
          customLauncherConfig.base = 'randomBaseLauncher';
        });

        it('does not add the `--no-sandbox` flag when', () => {
          const extensionConfig = withUnixPaths(
            new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
          );
          expect(extensionConfig.customLauncher).toEqual(
            expect.not.objectContaining({ flags: expect.arrayContaining(['--no-sandbox']) })
          );
        });

        it('does not remove or alter any of the configured flags', () => {
          customLauncherConfig.flags = ['--random-flag-one', 'randomFlagTwo', '-f3'];

          const extensionConfig = withUnixPaths(
            new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
          );
          expect(extensionConfig.customLauncher).toEqual(
            expect.objectContaining({ flags: ['--random-flag-one', 'randomFlagTwo', '-f3'] })
          );
        });
      });
    });
  });

  describe('when the `containerMode` setting is `disabled`', () => {
    beforeEach(() => {
      mockConfigValues.set(GeneralConfigSetting.ContainerMode, 'disabled');
    });

    describe('an `NonHeadlessModeEnabled` setting is false', () => {
      beforeEach(() => {
        mockConfigValues.set(GeneralConfigSetting.NonHeadlessModeEnabled, '');
      });

      describe('and a custom launcher', () => {
        let customLauncherConfig: CustomLauncher;

        beforeEach(() => {
          customLauncherConfig = { base: '', flags: [] };
          mockConfigValues.set(GeneralConfigSetting.CustomLauncher, customLauncherConfig);
        });

        describe('is configured with a base launcher name that is supported by the chrome browser helper', () => {
          beforeEach(() => {
            customLauncherConfig.base = 'ChromiumHeadless';
          });

          it('does not remove the `--headless` flag', () => {
            customLauncherConfig.flags = ['--headless'];

            const extensionConfig = withUnixPaths(
              new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
            );
            expect(extensionConfig.customLauncher).toEqual(expect.objectContaining({ flags: ['--headless'] }));
          });
        });
        describe('is configured with a base launcher name that is supported by the firefox browser helper', () => {
          beforeEach(() => {
            customLauncherConfig.base = 'FirefoxHeadless';
          });

          it('does not remove the `-headless` flag', () => {
            customLauncherConfig.flags = ['-headless'];

            const extensionConfig = withUnixPaths(
              new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
            );
            expect(extensionConfig.customLauncher).toEqual(expect.objectContaining({ flags: ['-headless'] }));
          });
        });

        describe('is configured with a base launcher name that is supported by the electron browser helper', () => {
          beforeEach(() => {
            customLauncherConfig.base = 'Electron';
          });

          it('does not configure the show parameter', () => {
            const extensionConfig = withUnixPaths(
              new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
            );
            expect(extensionConfig.customLauncher).not.toEqual(
              expect.objectContaining({
                browserWindowOptions: {
                  webPreferences: {
                    show: true
                  }
                }
              })
            );
          });
        });

        describe('is configured with a base launcher name that is not supported', () => {
          beforeEach(() => {
            customLauncherConfig.base = 'randomBaseLauncher';
          });

          it('does not remove or alter any of the configured flags', () => {
            customLauncherConfig.flags = ['--random-flag-one', 'randomFlagTwo', '-f3'];

            const extensionConfig = withUnixPaths(
              new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
            );
            expect(extensionConfig.customLauncher).toEqual(
              expect.objectContaining({ flags: ['--random-flag-one', 'randomFlagTwo', '-f3'] })
            );
          });
        });
      });
    });

    describe('an `NonHeadlessModeEnabled` setting is true', () => {
      beforeEach(() => {
        mockConfigValues.set(GeneralConfigSetting.NonHeadlessModeEnabled, 'true');
      });

      describe('and a custom launcher', () => {
        let customLauncherConfig: CustomLauncher;

        beforeEach(() => {
          customLauncherConfig = { base: '', flags: [] };
          mockConfigValues.set(GeneralConfigSetting.CustomLauncher, customLauncherConfig);
        });

        describe('is configured with a base launcher name that is supported by the chrome browser helper', () => {
          describe('and is a headless browser', () => {
            beforeEach(() => {
              customLauncherConfig.base = 'ChromeHeadless';
            });

            it('does not remove the `--headless` flag', () => {
              customLauncherConfig.flags = ['--headless'];

              const extensionConfig = withUnixPaths(
                new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
              );
              expect(extensionConfig.customLauncher).toEqual(expect.objectContaining({ flags: ['--headless'] }));
            });
          });

          describe('and is not a headless browser', () => {
            beforeEach(() => {
              customLauncherConfig.base = 'Chrome';
            });

            it('does remove the `--headless` flag', () => {
              customLauncherConfig.flags = ['--headless'];

              const extensionConfig = withUnixPaths(
                new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
              );
              expect(extensionConfig.customLauncher).toEqual(expect.objectContaining({ flags: [] }));
            });
          });
        });

        describe('is configured with a base launcher name that is supported by the firefox browser helper', () => {
          describe('and is a headless browser', () => {
            beforeEach(() => {
              customLauncherConfig.base = 'FirefoxHeadless';
            });

            it('does not remove the `-headless` flag', () => {
              customLauncherConfig.flags = ['-headless'];

              const extensionConfig = withUnixPaths(
                new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
              );
              expect(extensionConfig.customLauncher).toEqual(expect.objectContaining({ flags: ['-headless'] }));
            });
          });

          describe('and is not a headless browser', () => {
            beforeEach(() => {
              customLauncherConfig.base = 'Firefox';
            });

            it('does remove the `-headless` flag', () => {
              customLauncherConfig.flags = ['-headless'];

              const extensionConfig = withUnixPaths(
                new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
              );
              expect(extensionConfig.customLauncher).toEqual(expect.objectContaining({ flags: [] }));
            });
          });
        });

        describe('is configured with a base launcher name that is supported by the electron browser helper', () => {
          beforeEach(() => {
            customLauncherConfig.base = 'Electron';
          });

          it('does configure the show parameter', () => {
            const extensionConfig = withUnixPaths(
              new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
            );
            expect(extensionConfig.customLauncher).toEqual(
              expect.objectContaining({
                browserWindowOptions: {
                  webPreferences: {
                    show: true
                  }
                }
              })
            );
          });
        });

        describe('is configured with a base launcher name that is not supported', () => {
          beforeEach(() => {
            customLauncherConfig.base = 'randomBaseLauncher';
          });

          it('does not remove or alter any of the configured flags', () => {
            customLauncherConfig.flags = ['--random-flag-one', 'randomFlagTwo', '-f3'];

            const extensionConfig = withUnixPaths(
              new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
            );
            expect(extensionConfig.customLauncher).toEqual(
              expect.objectContaining({ flags: ['--random-flag-one', 'randomFlagTwo', '-f3'] })
            );
          });
        });
      });
    });
  });

  describe('when the `excludeFiles` setting is configured', () => {
    let configuredExcludeFiles: string[];

    beforeEach(() => {
      configuredExcludeFiles = [];
      mockConfigValues.set(GeneralConfigSetting.ExcludeFiles, configuredExcludeFiles);
    });

    it('includes the node_modules folder if it was not included in the configured exclusion list', () => {
      configuredExcludeFiles = ['fake/exclusion/glob'];
      const extensionConfig = withUnixPaths(
        new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
      );

      expect(extensionConfig.excludeFiles).toEqual(expect.arrayContaining(['**/node_modules/**/*']));
    });

    it('retains the node_modules folder if it was included in the configured exclusion list', () => {
      configuredExcludeFiles = ['fake/exclusion/glob/1', '**/node_modules/**/*', 'fake/exclusion/glob/2'];
      const extensionConfig = withUnixPaths(
        new ExtensionConfig(mockConfigStore, '/fake/workspace/path', mockFileHandler, mockLogger)
      );

      expect(extensionConfig.excludeFiles).toEqual(expect.arrayContaining(['**/node_modules/**/*']));
    });
  });
});
