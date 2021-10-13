import { TestCapabilities, TestFramework, TestInterface, TestSelector } from '../../core/base/test-framework';
import { TestFrameworkName } from '../../core/base/test-framework-name';
import { JasmineTestSelector } from './jasmine-test-selector';

const testInterface: TestInterface = {
  suite: ['describe', 'xdescribe', 'fdescribe'],
  test: ['it', 'xit', 'fit']
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
