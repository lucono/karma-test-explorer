import {
  asNonBlankStringOrUndefined,
  asNonEmptyArrayOrUndefined,
  excludeAbsentEntries,
  excludeSelectedEntries,
  isChildPath
} from '../../src/util/utils.js';

describe('Utils', () => {
  describe(`${excludeAbsentEntries.name} function`, () => {
    it('removes object properties with an undefined value', () => {
      const resultObj = excludeAbsentEntries({
        undefinedProp: undefined,
        randomProp: 'random value'
      });
      expect('undefinedProp' in resultObj).toBe(false);
    });

    it('removes object properties with a null value', () => {
      const resultObj = excludeAbsentEntries({
        nullProp: null,
        randomProp: 'random value'
      });

      expect(resultObj).toBeDefined();
      expect('nullProp' in resultObj).toBe(false);
    });

    it("doesn't remove object properties with a zero number value", () => {
      const resultObj = excludeAbsentEntries({
        zeroNumberProp: 0,
        randomprop: 'random value'
      });
      expect('zeroNumberProp' in resultObj).toBe(true);
    });

    it("doesn't remove object properties with an empty string value", () => {
      const resultObj = excludeAbsentEntries({
        emptyStringProp: '',
        randomProp: 'random value'
      });
      expect('emptyStringProp' in resultObj).toBe(true);
    });

    it('only removes object properties with a null or undefined value', () => {
      const resultObj = excludeAbsentEntries({
        undefinedProp: undefined,
        nullProp: null,
        emptyStringProp: '',
        nonEmptyStringProp: 'random string',
        zeroNumberProp: 0,
        nonZeroNumberProp: 5,
        falseBooleanProp: false,
        nonFalseBooleanProp: true
      });

      expect(Object.keys(resultObj)).toEqual(
        expect.arrayContaining([
          'emptyStringProp',
          'nonEmptyStringProp',
          'zeroNumberProp',
          'nonZeroNumberProp',
          'falseBooleanProp',
          'nonFalseBooleanProp'
        ])
      );
    });
  });

  describe(`${excludeSelectedEntries.name} function`, () => {
    describe(`when using a string array selector`, () => {
      it('excludes object keys matching the array entries when not empty', () => {
        const selectedEntries = ['prop_1', 'prop_3'];

        const resultObj = excludeSelectedEntries(
          {
            prop_1: 'value 1',
            prop_2: 'value 2',
            prop_3: 'value 3'
          },
          selectedEntries
        );
        expect(resultObj).toEqual({ prop_2: 'value 2' });
      });

      it("doesn't exclude any object entries when the selector array is empty", () => {
        const selectedEntries: string[] = [];

        const resultObj = excludeSelectedEntries(
          {
            prop_1: 'value 1',
            prop_2: 'value 2',
            prop_3: 'value 3'
          },
          selectedEntries
        );
        expect(resultObj).toEqual(resultObj);
      });
    });

    describe(`when using a selector function`, () => {
      it('excludes object keys matched by the selector', () => {
        const entrySelector = (key: string, value: string) => key === 'prop_1' || value === 'value 3';

        const resultObj = excludeSelectedEntries(
          {
            prop_1: 'value 1',
            prop_2: 'value 2',
            prop_3: 'value 3'
          },
          entrySelector
        );
        expect(resultObj).toEqual({ prop_2: 'value 2' });
      });
    });
  });

  describe(`${asNonBlankStringOrUndefined.name} function`, () => {
    it('returns undefined when called with an undefined value', () => {
      const returnString = asNonBlankStringOrUndefined(undefined);
      expect(returnString).toBeUndefined();
    });

    it('returns undefined when called with an empty string', () => {
      const returnString = asNonBlankStringOrUndefined('');
      expect(returnString).toBeUndefined();
    });

    it('returns undefined when called with a blank string', () => {
      const returnString = asNonBlankStringOrUndefined('   ');
      expect(returnString).toBeUndefined();
    });

    it('returns the input string when called with a non-empty string', () => {
      const inputString = '  x  ';
      const returnString = asNonBlankStringOrUndefined(inputString);
      expect(returnString).toEqual(inputString);
    });
  });

  describe(`${asNonEmptyArrayOrUndefined.name} function`, () => {
    it('returns undefined when called with an undefined value', () => {
      const returnString = asNonEmptyArrayOrUndefined(undefined);
      expect(returnString).toBeUndefined();
    });

    it('returns undefined when called with an empty array', () => {
      const returnString = asNonEmptyArrayOrUndefined([]);
      expect(returnString).toBeUndefined();
    });

    it('returns the input array when called with a non-empty array', () => {
      const inputArray = ['item'];
      const returnString = asNonEmptyArrayOrUndefined(inputArray);
      expect(returnString).toEqual(inputArray);
    });
  });

  describe('isChildPath function', () => {
    let parentPath: string;
    let childPath: string;

    beforeEach(() => {
      parentPath = '';
      childPath = '';
    });

    describe('when using windows style path separators', () => {
      const originalPlatform = process.platform;

      beforeEach(() => {
        Object.defineProperty(process, 'platform', {
          value: 'win32'
        });
      });

      afterEach(() => {
        Object.defineProperty(process, 'platform', {
          value: originalPlatform
        });
      });

      it('returns false when the child path is a parent of the parent path', () => {
        expect(isChildPath('\\path_1\\path_2', '\\path_1')).toBe(false);
      });

      it('returns false when the child path is a sibling of the parent path', () => {
        expect(isChildPath('\\path_1\\path_2', '\\path_1\\path_2_sibling')).toBe(false);
      });

      it('returns false when the child path is same as the parent path', () => {
        expect(isChildPath('\\path_1\\path_2', '\\path_1\\path_2')).toBe(false);
      });

      it('returns true when the child path is same as the parent path and `treatSamePathAsChild` is `true`', () => {
        expect(isChildPath('\\path_1\\path_2', '\\path_1\\path_2', true)).toBe(true);
      });

      it('returns true when the child path is under the parent path', () => {
        expect(isChildPath('\\path_1\\path_2', '\\path_1\\path_2\\path_2_child')).toBe(true);
      });
    });

    describe('when using posix style path separators', () => {
      it('returns false when the child path is a parent of the parent path', () => {
        expect(isChildPath('/path_1/path_2', '/path_1')).toBe(false);
      });

      it('returns false when the child path is a sibling of the parent path', () => {
        expect(isChildPath('/path_1/path_2', '/path_1/path_2_sibling')).toBe(false);
      });

      it('returns false when the child path is same as the parent path', () => {
        expect(isChildPath('/path_1/path_2', '/path_1/path_2')).toBe(false);
      });

      it('returns true when the child path is same as the parent path and `treatSamePathAsChild` is `true`', () => {
        expect(isChildPath('/path_1/path_2', '/path_1/path_2', true)).toBe(true);
      });

      it('returns true when the child path is under the parent path', () => {
        expect(isChildPath('/path_1/path_2', '/path_1/path_2/path_2_child')).toBe(true);
      });
    });

    describe('when the parent path is the root path', () => {
      beforeEach(() => {
        parentPath = '/';
      });

      it('returns false when the child path is also the root path', () => {
        childPath = '/';
        expect(isChildPath(parentPath, childPath)).toBe(false);
      });

      it('returns true when the child path is also the root path and `treatSamePathAsChild` is `true`', () => {
        childPath = '/';
        expect(isChildPath(parentPath, childPath, true)).toBe(true);
      });

      it('returns true when the child path is one level under the parent path', () => {
        childPath = `${parentPath}/child_path`;
        expect(isChildPath(parentPath, childPath)).toBe(true);
      });

      it('returns true when the child path is multiple levels under the parent path', () => {
        childPath = `${parentPath}/child_path_1/child_path_2`;
        expect(isChildPath(parentPath, childPath)).toBe(true);
      });
    });

    describe('when the parent path is directly under the root path', () => {
      beforeEach(() => {
        parentPath = '/folder_at_root_path';
      });

      it('returns false when the child path is the root path', () => {
        childPath = '/';
        expect(isChildPath(parentPath, childPath)).toBe(false);
      });

      it('returns false when the child path is a sibling folder of the parent path', () => {
        childPath = `${parentPath}_different`;
        expect(isChildPath(parentPath, childPath)).toBe(false);
      });

      it('returns false when the child path is same as the parent path', () => {
        childPath = parentPath;
        expect(isChildPath(parentPath, childPath)).toBe(false);
      });

      it('returns true when the child path is same as the parent path and `treatSamePathAsChild` is `true`', () => {
        childPath = parentPath;
        expect(isChildPath(parentPath, childPath, true)).toBe(true);
      });

      it('returns true when the child path is one level under the parent path', () => {
        childPath = `${parentPath}/child_path`;
        expect(isChildPath(parentPath, childPath)).toBe(true);
      });

      it('returns true when the child path is multiple levels under the parent path', () => {
        childPath = `${parentPath}/child_path_1/child_path_2`;
        expect(isChildPath(parentPath, childPath)).toBe(true);
      });
    });

    describe('when the parent path is multiple levels under the root path', () => {
      beforeEach(() => {
        parentPath = '/child_path_1/child_path_2';
      });

      it('returns false when the child path is the root path', () => {
        childPath = '/';
        expect(isChildPath(parentPath, childPath)).toBe(false);
      });

      it('returns false when the child path is a sibling folder of the parent path', () => {
        childPath = `${parentPath}_different`;
        expect(isChildPath(parentPath, childPath)).toBe(false);
      });

      it('returns false when the child path is same as the parent path', () => {
        childPath = parentPath;
        expect(isChildPath(parentPath, childPath)).toBe(false);
      });

      it('returns true when the child path is same as the parent path and `treatSamePathAsChild` is `true`', () => {
        childPath = parentPath;
        expect(isChildPath(parentPath, childPath, true)).toBe(true);
      });

      it('returns true when the child path is one level under the parent path', () => {
        childPath = `${parentPath}/extra_child_path`;
        expect(isChildPath(parentPath, childPath)).toBe(true);
      });

      it('returns true when the child path is multiple levels under the parent path', () => {
        childPath = `${parentPath}/extra_child_path_1/extra_child_path_2`;
        expect(isChildPath(parentPath, childPath)).toBe(true);
      });
    });
  });
});
