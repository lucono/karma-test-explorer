import { TestCapabilities, TestFramework, TestInterface, TestSelector } from '../../core/base/test-framework';
import { TestFrameworkName } from '../../core/base/test-framework-name';
import { MochaTestSelector } from './mocha-test-selector';

const bddTestInterface: TestInterface = {
  suite: ['describe', 'describe.only', 'describe.skip'],
  test: ['it', 'it.only', 'it.skip']
};

const tddTestInterface: TestInterface = {
  suite: ['suite', 'suite.only', 'suite.skip'],
  test: ['test', 'test.only', 'test.skip']
};

enum MochaInterfaceStyle {
  BDD = 'BDD',
  TDD = 'TDD'
}

const testCapabilities: TestCapabilities = {
  autoWatch: false
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
