import { TestInfo, TestSuiteInfo } from 'vscode-test-adapter-api';
import { Disposable } from '../api/disposable';
import { TestType } from '../api/test-infos';
import { Logger } from '../core/logger';

export class TestSuiteMerger implements Disposable {
	public constructor(private readonly logger: Logger) {}

	public merge(testSuites: TestSuiteInfo[]): TestSuiteInfo | undefined {
		if (testSuites.length === 0) {
			return undefined;
		}
		if (testSuites.length === 1) {
			return testSuites[0];
		}

		const mergedSuite = testSuites[0];
		const sourceSuites = testSuites.slice(1);
		sourceSuites.forEach(sourceSuite => this.mergeSuites(mergedSuite, sourceSuite));

		return mergedSuite;
	}

	private mergeSuites(targetSuite: TestSuiteInfo, sourceSuite: TestSuiteInfo) {
		const targetChildrenById: Map<string, TestInfo | TestSuiteInfo> = new Map();

		targetSuite.children.forEach(suiteChild => targetChildrenById.set(suiteChild.id, suiteChild));

		for (const sourceChild of sourceSuite.children) {
			const duplicatedTargetChild = targetChildrenById.get(sourceChild.id);

			if (!duplicatedTargetChild) {
				targetSuite.children.push(sourceChild);
				continue;
			}
			if (sourceChild.type === TestType.Suite && duplicatedTargetChild.type === TestType.Suite) {
				this.mergeSuites(duplicatedTargetChild, sourceChild);
			}
		}
	}

	public dispose() {
		this.logger.dispose();
	}
}
