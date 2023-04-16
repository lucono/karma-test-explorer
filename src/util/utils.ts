import { expand } from 'dotenv-expand';
import { dirname, isAbsolute, join, posix, win32 } from 'path';
import type { PackageJson } from 'type-fest';
import { sync as which } from 'which';

import { FileHandler } from './filesystem/file-handler.js';
import { Logger } from './logging/logger.js';

export const getPropertyWithValue = <T>(object: Record<string, T>, propValue: T): string | undefined => {
  return Object.keys(object).find(key => object[key] === propValue);
};

export const changePropertyCase = <T>(
  object: Readonly<Record<string, T>>,
  toCase: 'upper' | 'lower',
  ...propNames: string[]
): Record<string, T> => {
  const lowerCasePropsForAdjustment =
    propNames.length > 0 ? propNames.map(propName => propName.toLocaleLowerCase()) : Object.keys(object);

  const adjustCase = toCase === 'lower' ? String.prototype.toLocaleLowerCase : String.prototype.toLocaleUpperCase;

  const adjustedObject: Record<string, T> = transformObject(object, (key, value) => {
    const newKey = lowerCasePropsForAdjustment.includes(key.toLocaleLowerCase()) ? adjustCase.apply(key) : key;
    return { key: newKey, value };
  });

  return adjustedObject;
};

export const selectEntries = <T>(object: Record<string, T>, ...propNames: string[]): Record<string, T> => {
  const objectSubset: Record<string, T> = transformObject(object, (key, value) =>
    propNames.includes(key) ? { key, value } : undefined
  );
  return objectSubset;
};

export const excludeSelectedEntries = <T>(
  object: Readonly<Record<string, T>>,
  selector: readonly string[] | ((key: string, value: T) => boolean)
): Record<string, T> => {
  const entrySelector = typeof selector === 'function' ? selector : (key: string) => selector.includes(key);

  const filteredObject: Record<string, T> = transformObject(object, (key, value) =>
    entrySelector(key, value) === true ? undefined : { key, value }
  );
  return filteredObject;
};

export const excludeAbsentEntries = <T>(object: Readonly<Record<string, T>>): Record<string, NonNullable<T>> => {
  const filteredObject: Record<string, T> = excludeSelectedEntries(
    object,
    (key, value) => value === null || value === undefined
  );
  return filteredObject as Record<string, NonNullable<T>>;
};

export const transformObject = <T>(
  object: Record<string, T>,
  transformer: (key: string, value: T) => { key: string; value: T } | undefined
): Record<string, T> => {
  const transformedObject: Record<string, T> = {};

  Object.entries(object).forEach(([oldKey, oldValue]) => {
    const newEntry = transformer(oldKey, oldValue);

    if (newEntry !== undefined) {
      transformedObject[newEntry.key] = newEntry.value;
    }
  });
  return transformedObject;
};

export const generateRandomId = () => {
  return Math.random().toString(36).slice(2);
};

export const asNonBlankStringOrUndefined = (value?: string): string | undefined => {
  return (value ?? '').trim().length > 0 ? value : undefined;
};

export const asNonEmptyArrayOrUndefined = <T>(value?: T[]): T[] | undefined => {
  return (value ?? []).length > 0 ? value : undefined;
};

export const toSingleUniqueArray = <T>(...arrays: (T[] | undefined)[]): T[] => {
  const combinedArray = arrays.reduce(
    (arr1: T[] | undefined = [], arr2: T[] | undefined = []) => [...arr1, ...arr2],
    undefined
  );
  return [...new Set(combinedArray)];
};

// From MDN: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#escaping
export const escapeForRegExp = (stringValue: string) => {
  return stringValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

export const stripJsComments = (content: string): string => {
  // Regex from: https://stackoverflow.com/a/28974757/4307522
  return content.replace(
    /((?:(?:^[ \t]*)?(?:\/\*[^*]*\*+(?:[^\/*][^*]*\*+)*\/(?:[ \t]*\r?\n(?=[ \t]*(?:\r?\n|\/\*|\/\/)))?|\/\/(?:[^\\]|\\(?:\r?\n)?)*?(?:\r?\n(?=[ \t]*(?:\r?\n|\/\*|\/\/))|(?=\r?\n))))+)|("(?:\\[\S\s]|[^"\\])*"|'(?:\\[\S\s]|[^'\\])*'|(?:\r?\n|[\S\s])[^\/"'\\\s]*)/gm,
    '$2'
  );
};

export const normalizePath = (filePath: string): string => {
  return process.platform === 'win32'
    ? filePath
        .replace(/^[\/]?([A-Za-z]:)/, (_, drive) => drive.toUpperCase())
        .split(win32.sep)
        .join(posix.sep)
    : filePath;
};

export const isChildPath = (parentPath: string, childPath: string, treatSamePathAsChild: boolean = false): boolean => {
  const childFromParentRelativePath = posix.relative(normalizePath(parentPath), normalizePath(childPath));

  return (
    (treatSamePathAsChild || childPath !== parentPath) &&
    !posix.isAbsolute(childFromParentRelativePath) &&
    !childFromParentRelativePath.startsWith('..')
  );
};

export const getLongestCommonPath = (filePaths: string[]): string | undefined => {
  if (filePaths.some(filePath => !isAbsolute(filePath))) {
    return undefined;
  }
  const findCommonPath = (path1: string, path2: string): string => {
    const path1Segments = normalizePath(path1).split(posix.sep);
    const path2Segments = normalizePath(path2).split(posix.sep);
    const maxPathSegments = Math.min(path1Segments.length, path2Segments.length);
    const commonPathSegments: string[] = [];

    for (let pathIndex = 0; pathIndex < maxPathSegments; pathIndex++) {
      if (path1Segments[pathIndex] !== path2Segments[pathIndex]) {
        break;
      }
      commonPathSegments.push(path1Segments[pathIndex]);
    }
    return commonPathSegments.join(posix.sep);
  };
  const commonPathReducer = (commonPath: string | undefined, nextPath: string) => {
    return commonPath === undefined ? nextPath : findCommonPath(commonPath, nextPath);
  };

  const longestCommonPath = filePaths.reduce(commonPathReducer, undefined);
  return longestCommonPath;
};

// From MDN: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Cyclic_object_value
export const getJsonCircularReferenceReplacer = () => {
  const seen = new WeakSet();
  return (key: string, value: unknown) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return;
      }
      seen.add(value);
    }
    return value;
  };
};

export const regexJsonReplacer = (key: string, value: unknown) => {
  if (value instanceof RegExp) {
    return value.source;
  }
  return value;
};

export const expandEnvironment = (
  environment: Readonly<Record<string, string>>,
  logger: Logger
): Record<string, string> | undefined => {
  const UPPERCASE_NORMALIZED_ENVIRONMENT_VARIABLES = [
    'HOMEDRIVE',
    'HOMEPATH',
    'LOGONSERVER',
    'PATH',
    'SYSTEMDRIVE',
    'SYSTEMROOT',
    'TEMP',
    'USERDOMAIN',
    'USERNAME',
    'USERPROFILE',
    'WINDIR'
  ];

  let expandedEnvironment: Record<string, string> | undefined;

  try {
    const nonAbsentProcessEnv = excludeAbsentEntries(process.env);
    const processEnv = changePropertyCase(nonAbsentProcessEnv, 'upper', ...UPPERCASE_NORMALIZED_ENVIRONMENT_VARIABLES);
    const mergedProcessEnvironment = { ...processEnv, ...environment };

    expand({ parsed: mergedProcessEnvironment, ignoreProcessEnv: true } as any);
    expandedEnvironment = selectEntries(mergedProcessEnvironment, ...Object.keys(environment));
  } catch (error) {
    logger.error(
      () =>
        `Failed to expand combined environment: ${JSON.stringify(environment, null, 2)}\n` +
        `Expansion failed with error: ${error}`
    );
  }

  return expandedEnvironment;
};

export const getPackageJsonAtPath = (
  absolutePath: string,
  fileHandler: FileHandler,
  logger: Logger
): PackageJson | undefined => {
  const packageJsonFilePath = absolutePath.endsWith(`package.json`)
    ? normalizePath(absolutePath)
    : normalizePath(join(absolutePath, 'package.json'));

  if (!fileHandler.existsSync(packageJsonFilePath)) {
    logger.debug(() => `No package.json file at '${packageJsonFilePath}'`);
    return undefined;
  } else {
    logger.debug(() => `Found package.json file at '${packageJsonFilePath}'`);
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const packageJson: PackageJson | undefined = require(packageJsonFilePath);
  return packageJson;
};

export const getPackageInstallPathForProjectRoot = (
  moduleName: string,
  projectRootPath: string,
  logger: Logger,
  options?: { allowGlobalPackageFallback?: boolean }
): string | undefined => {
  let moduleInstallPath: string | undefined;

  try {
    const modulePackageJson = `${moduleName}/package.json`;
    const modulePackageJsonPath = require.resolve(modulePackageJson, { paths: [projectRootPath] });
    moduleInstallPath = dirname(modulePackageJsonPath);
    logger.debug(() => `Found '${moduleName}' module at: ${moduleInstallPath}`);
  } catch (error) {
    logger.warn(
      () => `Could not locate '${moduleName}' module globally or under project at '${projectRootPath}': ${error}`
    );
    return;
  }

  if (
    !!moduleInstallPath &&
    !isChildPath(projectRootPath, moduleInstallPath) &&
    options?.allowGlobalPackageFallback === false
  ) {
    logger.warn(
      () =>
        `Rejected resolved '${moduleName}' module located at '${moduleInstallPath}' ` +
        `which is outside of project at '${projectRootPath}'` +
        `and global package fallback is not enabled`
    );
    return;
  }

  return moduleInstallPath;
};

export const getNodeExecutablePath = (searchPath?: string): string => {
  const path = searchPath ?? process.env.PATH;
  const npxExecutablePath = which('npx', { all: false, nothrow: true, path });

  const npxNodeExecutablePath = npxExecutablePath
    ? which('node', { all: false, nothrow: true, path: dirname(npxExecutablePath) })
    : undefined;

  const nodeExecutablePath = which('node', { all: false, nothrow: true, path });

  return npxNodeExecutablePath ?? nodeExecutablePath ?? process.execPath;
};
