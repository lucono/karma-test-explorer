import dotenvExpand from 'dotenv-expand';
import { getInstalledPathSync } from 'get-installed-path';
import { dirname, isAbsolute, posix, relative, sep } from 'path';
import which from 'which';
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
  const combinedArray = arrays.reduce((arr1: T[] | undefined = [], arr2: T[] | undefined = []) => [...arr1, ...arr2]);
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
        .split(sep)
        .join(posix.sep)
    : filePath;
};

export const isChildPath = (parentPath: string, childPath: string): boolean => {
  const childFromParentRelativePath = relative(parentPath, childPath);

  return (
    childPath !== parentPath &&
    !isAbsolute(childFromParentRelativePath) &&
    !childFromParentRelativePath.startsWith('..')
  );
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
  packageName: string,
  projectRootPath: string,
  options?: { allowGlobalPackageFallback?: boolean },
  logger?: Logger
): string | undefined => {
  let packageInstallPath: string | undefined;

  try {
    packageInstallPath = getInstalledPathSync(packageName, { local: true, cwd: projectRootPath });
    logger?.debug(() => `Found '${packageName}' local package at: ${packageInstallPath}`);
  } catch (error) {
    logger?.warn(
      () => `Could not find '${packageName}' local package install in root path '${projectRootPath}': ${error}`
    );
  }

  if (!packageInstallPath && options?.allowGlobalPackageFallback === true) {
    try {
      packageInstallPath = getInstalledPathSync(packageName);
      logger?.debug(() => `Found '${packageName}' global package at: ${packageInstallPath}`);
    } catch (error) {
      logger?.warn(() => `Could not find '${packageName}' global package install: ${error}`);
      return;
    }
  }

  return packageInstallPath;
};

export const getNodeExecutablePath = (searchPath?: string): string => {
  const path = searchPath ?? process.env.PATH;
  const npxExecutablePath = which.sync('npx', { all: false, nothrow: true, path });

  const npxNodeExecutablePath = npxExecutablePath
    ? which.sync('node', { all: false, nothrow: true, path: dirname(npxExecutablePath) })
    : undefined;

  const nodeExecutablePath = which.sync('node', { all: false, nothrow: true, path });

  return npxNodeExecutablePath ?? nodeExecutablePath ?? process.execPath;
};
