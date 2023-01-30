import { TestFrameworkName } from '../../core/base/test-framework-name.js';
import { TestCapabilities, TestFramework, TestInterface, TestSelector } from '../../core/base/test-framework.js';
import { MochaTestSelector } from './mocha-test-selector.js';

const bddTestInterface: TestInterface = {
  suiteTags: {
    default: ['describe'],
    focused: ['describe.only'],
    disabled: ['describe.skip']
  },

  testTags: {
    default: ['it'],
    focused: ['it.only'],
    disabled: ['it.skip']
  }
};

const tddTestInterface: TestInterface = {
  suiteTags: {
    default: ['suite'],
    focused: ['suite.only'],
    disabled: ['suite.skip']
  },

  testTags: {
    default: ['test'],
    focused: ['test.only'],
    disabled: ['test.skip']
  }
};

enum MochaInterfaceStyle {
  BDD = 'BDD',
  TDD = 'TDD'
}

const testCapabilities: TestCapabilities = {
  watchModeSupport: false
};

class MochaFramework implements TestFramework {
  private readonly testSelector: TestSelector;
  public readonly name: TestFrameworkName;

  public constructor(private readonly interfaceStyle: MochaInterfaceStyle) {
    this.testSelector = new MochaTestSelector();
    this.name = interfaceStyle === MochaInterfaceStyle.TDD ? TestFrameworkName.MochaTDD : TestFrameworkName.MochaBDD;
  }

  public getTestInterface(): TestInterface {
    return this.interfaceStyle === MochaInterfaceStyle.TDD ? tddTestInterface : bddTestInterface;
  }

  public getTestSelector(): TestSelector {
    return this.testSelector;
  }

  public getTestCapabilities(): TestCapabilities {
    return testCapabilities;
  }
}

export const MochaTestFrameworkBdd = new MochaFramework(MochaInterfaceStyle.BDD);
export const MochaTestFrameworkTdd = new MochaFramework(MochaInterfaceStyle.TDD);
