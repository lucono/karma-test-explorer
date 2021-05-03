import { SpecCompleteResponse } from "../../model/spec-complete-response";
import { PathFinder, SpecLocation } from "../helpers/path-finder";
import { TestSuiteInfo, TestInfo } from "vscode-test-adapter-api";
import { TestType } from "../../model/enums/test-type.enum";

export class SpecResponseToTestSuiteInfoMapper {
  public constructor(private readonly pathFinder: PathFinder) {}

  public map(specs: SpecCompleteResponse[]): TestSuiteInfo {
    const suiteNodes: Set<TestSuiteInfo> = new Set();
    const rootSuiteId = this.generateSuiteName(suiteNodes.size);

    const rootSuiteNode: TestSuiteInfo = {
      type: TestType.Suite,
      id: rootSuiteId, // "root",
      label: "Karma tests",
      fullName: "", // "root",
      children: [],
    };

    for (const spec of specs) {
      const suiteNames = this.filterSuiteNames(spec.suite);
      const specLocation = this.pathFinder.getSpecLocation(suiteNames, spec.description);
      const newSuiteId = this.generateSuiteName(suiteNodes.size);
      const suiteNode = this.getOrCreateLowerSuiteNode(rootSuiteNode, suiteNames, newSuiteId);
      suiteNodes.add(suiteNode);
      this.createTest(spec, suiteNode, suiteNames, specLocation);
    }
    return rootSuiteNode;
  }

  private generateSuiteName(suiteNumber: number) {
    return `suite${suiteNumber}`;
  }

  private getOrCreateLowerSuiteNode(node: TestSuiteInfo, suiteNames: string[], newSuiteId: string): TestSuiteInfo {

    const currentSuiteNames = [] as string[];

    for (const suiteName of suiteNames) {
      currentSuiteNames.push(suiteName);
      let nextNode = this.findNodeByKey(node, suiteName);

      if (!nextNode) {
        nextNode = this.createSuite(currentSuiteNames, newSuiteId);
        node.children.push(nextNode);
      }
      node = nextNode;
    }
    return node;
  }

  private findNodeByKey(node: TestInfo | TestSuiteInfo, suiteLookup: string): TestSuiteInfo | undefined {
    if (node.type === TestType.Test) {
      return undefined;
    }

    if (node.label === suiteLookup) {
      return node;
    } else {
      for (const child of node.children) {
        if (child.type === TestType.Suite && child.label === suiteLookup) {
          return child as TestSuiteInfo;
        }
      }
    }
    return undefined;
  }

  private filterSuiteNames(suiteNames: string[]) {
    if (suiteNames.length > 0 && "Jasmine__TopLevel__Suite" === suiteNames[0]) {
      suiteNames = suiteNames.slice(1);
    }
    return suiteNames;
  }

  private createTest(
    specComplete: SpecCompleteResponse, 
    suiteNode: TestSuiteInfo, 
    suiteNames: string[],
    specLocation?: SpecLocation) {

    const testFullName = [...suiteNames, specComplete.description].join(" ");
    const failureMessages = specComplete.failureMessages?.length > 0
      ? specComplete.failureMessages.join("\n")
      : undefined;

    const testInfo: TestInfo = {
      type: TestType.Test,
      id: specComplete.id,
      fullName: testFullName,
      label: specComplete.description,
      // description: `${specComplete.timeSpentInMilliseconds} ms,
      tooltip: testFullName,
      message: failureMessages,
      file: specLocation?.file,
      line: specLocation?.line,
    };

    suiteNode.children.push(testInfo);
  }

  private createSuite(suiteNames: string[], newSuiteId: string): TestSuiteInfo {
    const suiteName = suiteNames[suiteNames.length - 1];
    const suiteFullName = suiteNames.join(" ");
    const suiteLocation = this.pathFinder.getSpecLocation(suiteNames);

    const suiteNode: TestSuiteInfo = {
      type: TestType.Suite,
      id: newSuiteId,
      fullName: suiteFullName,
      label: suiteName,
      tooltip: suiteFullName,
      file: suiteLocation?.file,
      line: suiteLocation?.line,
      children: [],
    };

    return suiteNode;
  }
}