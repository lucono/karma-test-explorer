import { AnyTestInfo } from '../src/core/base/test-infos';

export type Writeable<T> = { -readonly [P in keyof T]: T[P] };

export const testSuiteWindowsToPosixStylePaths = <T extends AnyTestInfo>(suite: T): T => {
  const convertPath = (windowsPath: string) => windowsPath?.replace(/^[a-zA-Z]:/, '').replace(/\\/g, '/');

  suite.id = convertPath(suite.id);
  suite.label = convertPath(suite.label);

  if (suite.tooltip) {
    suite.tooltip = convertPath(suite.tooltip);
  }
  if (suite.file) {
    suite.file = convertPath(suite.file);
  }
  if ('path' in suite && suite.path) {
    suite.path = convertPath(suite.path);
  }
  if ('children' in suite) {
    suite.children.forEach(childTest => testSuiteWindowsToPosixStylePaths(childTest));
  }
  return suite;
};
