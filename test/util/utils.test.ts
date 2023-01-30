import {
  asNonBlankStringOrUndefined,
  asNonEmptyArrayOrUndefined,
  isChildPath,
  removeAbsentProperties
} from '../../src/util/utils.js';

describe('Utils', () => {
  describe(`${removeAbsentProperties.name} function`, () => {
    it('removes object properties with an undefined value', () => {
      const resultObj = removeAbsentProperties({
        undefinedProp: undefined,
        randomProp: 'random value'
      });
      expect('undefinedProp' in resultObj).toBe(false);
    });

    it('removes object properties with a null value', () => {
      const resultObj = removeAbsentProperties({
        nullProp: null,
        randomProp: 'random value'
      });

      expect(resultObj).toBeDefined();
      expect('nullProp' in resultObj).toBe(false);
    });

    it("doesn't remove object properties with a zero number value", () => {
      const resultObj = removeAbsentProperties({
        zeroNumberProp: 0,
        randomprop: 'random value'
      });
      expect('zeroNumberProp' in resultObj).toBe(true);
    });

    it("doesn't remove object properties with an empty string value", () => {
      const resultObj = removeAbsentProperties({
        emptyStringProp: '',
        randomProp: 'random value'
      });
      expect('emptyStringProp' in resultObj).toBe(true);
    });

    it('only removes object properties with a null or undefined value', () => {
      const resultObj = removeAbsentProperties({
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
