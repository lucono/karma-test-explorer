import { TestInfo, TestSuiteInfo } from "vscode-test-adapter-api";
import { Disposable } from "../api/disposable";
import { TestType } from "../api/test-infos";
import { Logger } from "./logger";

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

  private mergeSuites(targetSuite: TestSuiteInfo, sourceSuite: TestSuiteInfo): TestSuiteInfo {
    const targetChildrenById: Map<string, TestInfo | TestSuiteInfo> = new Map();

    targetSuite.children.forEach(suiteChild => targetChildrenById.set(suiteChild.id, suiteChild));

    const mergedChildren: (TestInfo | TestSuiteInfo)[] = [];

    for (const sourceChild of sourceSuite.children) {
      const duplicateTargetChild = targetChildrenById.get(sourceChild.id);
      let mergedChild: TestInfo | TestSuiteInfo = sourceChild;

      if (sourceChild.type === TestType.Suite && duplicateTargetChild?.type === TestType.Suite) {
        mergedChild = this.mergeSuites(duplicateTargetChild, sourceChild);
      }
      mergedChildren.push(mergedChild);
    }
    targetSuite.children = mergedChildren;
    return targetSuite;
  }

  public dispose() {
    this.logger.dispose();
  }
}