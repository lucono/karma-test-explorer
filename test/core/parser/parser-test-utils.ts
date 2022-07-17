export interface InterfaceKeywords {
  readonly describe: string;
  readonly fdescribe: string;
  readonly xdescribe: string;
  readonly it: string;
  readonly fit: string;
  readonly xit: string;
}

export const jasmineInterfaceKeywords: InterfaceKeywords = {
  describe: 'describe',
  fdescribe: 'fdescribe',
  xdescribe: 'xdescribe',
  it: 'it',
  fit: 'fit',
  xit: 'xit'
};

export const mochaBddInterfaceKeywords: InterfaceKeywords = {
  describe: 'describe',
  fdescribe: 'describe.only',
  xdescribe: 'describe.skip',
  it: 'it',
  fit: 'it.only',
  xit: 'it.skip'
};

export const mochaTddInterfaceKeywords: InterfaceKeywords = {
  describe: 'suite',
  fdescribe: 'suite.only',
  xdescribe: 'suite.skip',
  it: 'test',
  fit: 'test.only',
  xit: 'test.skip'
};
