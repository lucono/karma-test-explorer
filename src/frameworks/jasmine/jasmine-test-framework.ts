import { TestFrameworkName } from '../../core/base/test-framework-name.js';
import { TestCapabilities, TestFramework, TestInterface, TestSelector } from '../../core/base/test-framework.js';
import { JasmineTestSelector } from './jasmine-test-selector.js';

const testInterface: TestInterface = {
  suiteTags: {
    default: ['describe'],
    focused: ['fdescribe'],
    disabled: ['xdescribe']
  },

  testTags: {
    default: ['it'],
    focused: ['fit'],
    disabled: ['xit']
  }
};

const testCapabilities: TestCapabilities = {
  watchModeSupport: true
};

class JasmineFramework implements TestFramework {
  private testSelector: TestSelector;
  public readonly name = TestFrameworkName.Jasmine;

  public constructor() {
    this.testSelector = new JasmineTestSelector();
  }

  public getTestInterface(): TestInterface {
    return testInterface;
  }

  public getTestSelector(): TestSelector {
    return this.testSelector;
  }

  public getTestCapabilities(): TestCapabilities {
    return testCapabilities;
  }
}

export const JasmineTestFramework: JasmineFramework = new JasmineFramework();
