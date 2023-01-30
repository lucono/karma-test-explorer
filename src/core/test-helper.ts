import { TestActiveState } from '../types/vscode-test-adapter-api.js';
import { Disposable } from '../util/disposable/disposable.js';
import { Disposer } from '../util/disposable/disposer.js';
import { Logger } from '../util/logging/logger.js';
import { TestDefinition, TestDefinitionState } from './base/test-definition.js';

export interface TestHelperOptions {
  showTestDefinitionTypeIndicators?: boolean;
}

export class TestHelper implements Disposable {
  private readonly options: Required<TestHelperOptions>;

  public constructor(private readonly logger: Logger, options?: TestHelperOptions) {
    this.options = { showTestDefinitionTypeIndicators: true, ...options };
  }

  public getTestActiveState(testDefinition?: TestDefinition, existingActiveState?: TestActiveState): TestActiveState {
    const testActiveState: TestActiveState =
      testDefinition?.state === TestDefinitionState.Focused
        ? 'focused'
        : testDefinition?.state === TestDefinitionState.Disabled
        ? 'disabled'
        : testDefinition?.disabled
        ? 'disabledOut'
        : existingActiveState ?? 'default';

    return testActiveState;
  }

  public getTestTooltip(testFullName: string, testActiveState?: TestActiveState) {
    const stateIndicatorLabel =
      testActiveState === 'focused' || testActiveState === 'focusedIn'
        ? ' (Focused)'
        : testActiveState === 'disabled' || testActiveState === 'disabledOut'
        ? ' (Disabled)'
        : '';

    return `${testFullName}${stateIndicatorLabel}`;
  }

  public getTestLabel(
    testName: string,
    testDefinitionOrState?: TestDefinition | TestDefinitionState,
    testActiveState?: TestActiveState
  ): string {
    if (!testDefinitionOrState) {
      return `❔ ${testName}`;
    }

    if (!this.options.showTestDefinitionTypeIndicators) {
      return testName;
    }

    const testDefinition = typeof testDefinitionOrState === 'string' ? undefined : testDefinitionOrState;

    const testDefinitionState =
      typeof testDefinitionOrState === 'string' ? testDefinitionOrState : testDefinitionOrState.state;

    const stateIndicatorLabel =
      testDefinitionState === TestDefinitionState.Focused
        ? '⚡ '
        : testDefinitionState === TestDefinitionState.Disabled
        ? '💤 '
        : testDefinition?.disabled
        ? '🔹 '
        : testActiveState === 'focused'
        ? '⚡ '
        : testActiveState === 'focusedIn'
        ? '🔸 '
        : testActiveState === 'disabled'
        ? '💤 '
        : testActiveState === 'disabledOut'
        ? '🔹 '
        : '';

    return `${stateIndicatorLabel}${testName}`;
  }

  public async dispose() {
    await Disposer.dispose(this.logger);
  }
}
