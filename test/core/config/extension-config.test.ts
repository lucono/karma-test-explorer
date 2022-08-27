import { mock, MockProxy } from 'jest-mock-extended';
import { CustomLauncher } from 'karma';
import { DebugConfiguration } from 'vscode';
import { GeneralConfigSetting } from '../../../src/core/config/config-setting';
import { ConfigStore } from '../../../src/core/config/config-store';
import { ExtensionConfig } from '../../../src/core/config/extension-config';
import { FileHandler } from '../../../src/util/filesystem/file-handler';
import { Logger } from '../../../src/util/logging/logger';
import { asExtensionConfigWithUnixStylePaths as withUnixPaths } from '../../test-util';

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
      has: mockConfigValues.has,
      get: key => (mockConfigValues.has(key) ? mockConfigValues.get(key) : ''),
      inspect: key => (mockConfigDefaults.has(key) ? { defaultValue: mockConfigDefaults.get(key) } : undefined)
    };
  });

  describe('`customLauncher` setting', () => {
    let customLauncherConfig: CustomLauncher;
    let customLauncherConfigDefault: CustomLauncher;

    beforeEach(() => {
      customLauncherConfig = { base: '', flags: [] };
      mockConfigValues.set(GeneralConfigSetting.CustomLauncher, customLauncherConfig);

      customLauncherConfigDefault = { base: '', flags: [] };
      mockConfigDefaults.set(GeneralConfigSetting.CustomLauncher, customLauncherConfigDefault);
    });

    describe('when has a `base` that is same as the default', () => {
      beforeEach(() => {
        customLauncherConfigDefault.base = 'randomDefaultBaseLauncherName';
        customLauncherConfig.base = customLauncherConfigDefault.base;
      });

      describe('and the `debuggerConfig` setting', () => {
        let debuggerConfig: DebugConfiguration;
        let debuggerConfigDefault: DebugConfiguration;

        beforeEach(() => {
          debuggerConfig = { name: '', type: '', request: '' };
          mockConfigValues.set(GeneralConfigSetting.DebuggerConfig, debuggerConfig);

          debuggerConfigDefault = { name: '', type: '', request: '' };
          mockConfigDefaults.set(GeneralConfigSetting.DebuggerConfig, debuggerConfigDefault);
        });

        describe('has a `type` that is same as the default', () => {
          beforeEach(() => {
            debuggerConfigDefault.type = 'fake-debugger-type';
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

        describe('has a `type` that is different from the default', () => {
          beforeEach(() => {
            debuggerConfigDefault.type = 'fake-debugger-type';
            debuggerConfig.type = 'different-fake-debugger-type';
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

    describe('when has a `base` that is different from the default', () => {
      beforeEach(() => {
        customLauncherConfigDefault.base = 'randomDefaultBaseLauncherName';
        customLauncherConfig.base = 'differentDefaultBaseLauncherName';
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

      describe('is configured with a base launcher name that contains the string "chrome" in any casing', () => {
        beforeEach(() => {
          customLauncherConfig.base = 'randomChRoMeBasedBrowser';
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
      });

      describe('is configured with a base launcher name that does not contain the string "chrome"', () => {
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
