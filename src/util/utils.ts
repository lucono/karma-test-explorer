export const generateRandomId = () => Math.random().toString(36).slice(2);

// From MDN: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#escaping
export const escapeForRegExp = (stringValue: string) => stringValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
