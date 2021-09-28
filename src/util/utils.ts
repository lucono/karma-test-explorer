import path = require('path');

export const generateRandomId = () => Math.random().toString(36).slice(2);

// From MDN: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#escaping
export const escapeForRegExp = (stringValue: string) => stringValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const toPosixPath = (filePath: string) => filePath.split(path.sep).join(path.posix.sep);

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
