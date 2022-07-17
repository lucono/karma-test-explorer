import dotenvExpand from 'dotenv-expand';
import { dirname, isAbsolute, posix, win32 } from 'path';
import { sync as which } from 'which';
import { GeneralConfigSetting } from '../core/config/config-setting';
import { Logger } from './logging/logger';

export const getPropertyWithValue = <T>(object: Record<string, T>, propValue: T): string | undefined => {
  return Object.keys(object).find(key => object[key] === propValue);
};

export const extractProperties = <T>(object: Record<string, T>, ...propNames: string[]): Record<string, T> => {
  const objectSubset: Record<string, T> = {};
  propNames.forEach(propName => (objectSubset[propName] = object[propName]));
  return objectSubset;
};

export const transformProperties = <T>(
  transformer: (value: T) => T,
  object: Record<string, T>,
  propNames?: string[]
): Record<string, T> => {
  const transformedObject: Record<string, T> = {};
  const propsToTransform = propNames ?? Object.keys(object);
  propsToTransform.forEach(propName => (transformedObject[propName] = transformer(object[propName])));
  return transformedObject;
};

export const changePropertyCase = <T>(
  object: Readonly<Record<string, T>>,
  toCase: 'upper' | 'lower',
  ...propNames: string[]
): Record<string, T> => {
  const adjustedObject: Record<string, T> = {};
  const adjustCase = toCase === 'lower' ? String.prototype.toLocaleLowerCase : String.prototype.toLocaleUpperCase;
  const lowerCasePropsForAdjustment = propNames.map(propName => propName.toLocaleLowerCase());

  Object.keys(object).forEach(originalProp => {
    const adjustedProp = lowerCasePropsForAdjustment.includes(originalProp.toLocaleLowerCase())
      ? adjustCase.apply(originalProp)
      : originalProp;

    adjustedObject[adjustedProp] = object[originalProp];
  });

  return adjustedObject;
};

export const generateRandomId = () => {
  return Math.random().toString(36).slice(2);
};

export const asNonBlankStringOrUndefined = (value?: string): string | undefined => {
  return (value ?? '').trim().length > 0 ? value : undefined;
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
export const getCircularReferenceReplacer = () => {
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

export const expandEnvironment = (
  environment: Readonly<Record<string, string>>,
  logger?: Logger
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
    const processEnv = changePropertyCase(process.env, 'upper', ...UPPERCASE_NORMALIZED_ENVIRONMENT_VARIABLES);
    const mergedProcessEnvironment = { ...processEnv, ...environment } as Record<string, string>;

    dotenvExpand(<any>{ parsed: mergedProcessEnvironment, ignoreProcessEnv: true });
    expandedEnvironment = extractProperties(mergedProcessEnvironment, ...Object.keys(environment));
  } catch (error) {
    logger?.error(
      () =>
        `Failed to expand combined environment: ${JSON.stringify(environment, null, 2)}\n` +
        `Expansion failed with error: ${error}`
    );
  }

  return expandedEnvironment;
};

export const getPackageInstallPathForProjectRoot = (
  moduleName: string,
  projectRootPath: string,
  options?: { allowGlobalPackageFallback?: boolean },
  logger?: Logger
): string | undefined => {
  let moduleInstallPath: string | undefined;

  try {
    const modulePackageJson = `${moduleName}/package.json`;
    const modulePackageJsonPath = require.resolve(modulePackageJson, { paths: [projectRootPath] });
    moduleInstallPath = dirname(modulePackageJsonPath);
    logger?.debug(() => `Found '${moduleName}' module at: ${moduleInstallPath}`);
  } catch (error) {
    logger?.warn(
      () => `Could not locate '${moduleName}' module globally or under project at '${projectRootPath}': ${error}`
    );
    return;
  }

  if (
    !!moduleInstallPath &&
    !isChildPath(projectRootPath, moduleInstallPath) &&
    options?.allowGlobalPackageFallback === false
  ) {
    logger?.warn(
      () =>
        `Rejected resolved '${moduleName}' module located at '${moduleInstallPath}' ` +
        `which is outside of project at '${projectRootPath}'` +
        `and '${GeneralConfigSetting.AllowGlobalPackageFallback}' is not enabled`
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
