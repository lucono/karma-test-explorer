import { getInstalledPathSync } from 'get-installed-path';
import path from 'path';

export const generateRandomId = () => Math.random().toString(36).slice(2);

export const getPropertyWithValue = <T>(object: Record<string, T>, propValue: T): string | undefined => {
  return Object.keys(object).find(key => object[key] === propValue);
};

export const toSingleUniqueArray = <T>(...arrays: (T[] | undefined)[]): T[] => {
  const combinedArray = arrays.reduce((arr1: T[] | undefined = [], arr2: T[] | undefined = []) => [...arr1, ...arr2]);
  return [...new Set(combinedArray)];
};

export const asNonBlankStringOrUndefined = (value?: string): string | undefined => {
  return (value ?? '').trim().length > 0 ? value : undefined;
};

export const stripJsComments = (content: string): string => {
  // Regex from: https://stackoverflow.com/a/28974757/4307522
  return content.replace(
    /((?:(?:^[ \t]*)?(?:\/\*[^*]*\*+(?:[^\/*][^*]*\*+)*\/(?:[ \t]*\r?\n(?=[ \t]*(?:\r?\n|\/\*|\/\/)))?|\/\/(?:[^\\]|\\(?:\r?\n)?)*?(?:\r?\n(?=[ \t]*(?:\r?\n|\/\*|\/\/))|(?=\r?\n))))+)|("(?:\\[\S\s]|[^"\\])*"|'(?:\\[\S\s]|[^'\\])*'|(?:\r?\n|[\S\s])[^\/"'\\\s]*)/gm,
    '$2'
  );
};

// From MDN: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#escaping
export const escapeForRegExp = (stringValue: string) => stringValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const normalizePath = (filePath: string): string => {
  return process.platform === 'win32'
    ? filePath
        .replace(/^[\/]?([A-Za-z]:)/, (_, drive) => drive.toUpperCase())
        .split(path.sep)
        .join(path.posix.sep)
    : filePath;
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

export const getValueTypeReplacer = () => {
  const seen = new WeakSet();
  const replacer = (key: string, value: any) => {
    try {
      if (Array.isArray(value)) {
        return value;
      } else if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return;
        }
        seen.add(value);
        const result: Record<string, any> = {};
        Object.keys(value).forEach(propName => (result[propName] = replacer(propName, value[propName])));
        return result;
      } else if (typeof value === 'function') {
        return `${value.name}()`;
      }
    } catch (error) {
      /* No handling required */
    }
    return value === null ? 'null' : typeof value;
  };
  return replacer;
};

export const getPackageInstallPathForProjectRoot = (
  packageName: string,
  projectRootPath?: string
): string | undefined => {
  let packageInstallPath: string | undefined;

  if (projectRootPath) {
    try {
      packageInstallPath = getInstalledPathSync(packageName, { local: true, cwd: projectRootPath });
    } catch (error) {
      console.warn(`Could not find '${packageName}' package local install at root path '${projectRootPath}': ${error}`);
    }
  }

  if (!packageInstallPath) {
    try {
      packageInstallPath = getInstalledPathSync('karma');
    } catch (error) {
      console.warn(`Could not find '${packageName}' package global install: ${error}`);
      return;
    }
  }

  return packageInstallPath;
};
