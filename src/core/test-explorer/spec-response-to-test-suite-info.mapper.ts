import { SpecCompleteResponse } from "../../model/spec-complete-response";
import { PathFinder, SpecLocation } from "../helpers/path-finder";
import { TestSuiteInfo, TestInfo } from "vscode-test-adapter-api";

export class SpecResponseToTestSuiteInfoMapper {
  public constructor(private readonly pathFinder: PathFinder) {}

  public map(specs: SpecCompleteResponse[]): TestSuiteInfo {
    const rootSuiteNode = {
      type: "suite",
      id: "root",
      label: "Karma tests",
      fullName: "root",
      children: [],
    } as TestSuiteInfo;

    for (const spec of specs) {
      const suiteNames = this.filterSuiteNames(spec.suite);
      const specLocation = this.pathFinder.getSpecLocation(suiteNames, spec.description);
      const suiteNode = this.getOrCreateLowerSuiteNode(rootSuiteNode, suiteNames);
      this.createTest(spec, suiteNode, suiteNames, specLocation);
    }
    return rootSuiteNode;
  }

  private getOrCreateLowerSuiteNode(node: TestSuiteInfo, suiteNames: string[]): TestSuiteInfo {

    const currentSuiteNames = [] as string[];

    for (const suiteName of suiteNames) {
      currentSuiteNames.push(suiteName);
      let nextNode = this.findNodeByKey(node, suiteName);

      if (!nextNode) {
        nextNode = this.createSuite(currentSuiteNames);
        node.children.push(nextNode);
      }
      node = nextNode;
    }
    return node;
  }

  private findNodeByKey(node: TestInfo | TestSuiteInfo, suiteLookup: string): TestSuiteInfo | undefined {
    if (node.type === "test") {
      return undefined;
    }

    if (node.label === suiteLookup) {
      return node;
    } else {
      for (const child of node.children) {
        if (child.type === "suite" && child.label === suiteLookup) {
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
      type: "test",
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

  private createSuite(suiteNames: string[]): TestSuiteInfo {
    const suiteName = suiteNames[suiteNames.length - 1];
    const suiteFullName = suiteNames.join(" ");
    const suiteLocation = this.pathFinder.getSpecLocation(suiteNames);

    const suiteNode = {
      type: "suite",
      id: suiteFullName,
      fullName: suiteFullName,
      label: suiteName,
      file: suiteLocation?.file,
      line: suiteLocation?.line,
      children: [],
    } as TestSuiteInfo;

    return suiteNode;
  }
}