import { sep as pathSeparator, posix } from 'path';

import { AnyTestInfo } from '../src/core/base/test-infos.js';
import { ExtensionConfig } from '../src/core/config/extension-config.js';

export type Writeable<T> = { -readonly [P in keyof T]: T[P] };

export const asUnixStylePath = <T extends string | undefined>(path: T): T => {
  const isWindowsOs = process.platform === 'win32';
  const unixStylePath = isWindowsOs ? path?.replace(/^[a-zA-Z]:/, '').replace(/\\/g, '/') : path;
  return unixStylePath as T;
};

export const withUnixStyleSeparator = (filePath: string) => filePath.split(pathSeparator).join(posix.sep);

export const asExtensionConfigWithUnixStylePaths = (extensionConfig: ExtensionConfig): ExtensionConfig => {
  const config = extensionConfig as Writeable<ExtensionConfig>;
  config.projectPath = asUnixStylePath(extensionConfig.projectPath);
  config.testsBasePath = asUnixStylePath(extensionConfig.testsBasePath);
  config.baseKarmaConfFilePath = asUnixStylePath(extensionConfig.baseKarmaConfFilePath);
  config.projectKarmaConfigFilePath = asUnixStylePath(extensionConfig.projectKarmaConfigFilePath);

  return extensionConfig;
};

export const asTestSuiteWithUnixStylePaths = <T extends AnyTestInfo>(suite: T): T => {
  suite.id = asUnixStylePath(suite.id);
  suite.label = asUnixStylePath(suite.label);

  if (suite.tooltip) {
    suite.tooltip = asUnixStylePath(suite.tooltip);
  }
  if (suite.file) {
    suite.file = asUnixStylePath(suite.file);
  }
  if ('path' in suite && suite.path) {
    suite.path = asUnixStylePath(suite.path);
  }
  if ('children' in suite) {
    suite.children.forEach(childTest => asTestSuiteWithUnixStylePaths(childTest));
  }
  return suite;
};
