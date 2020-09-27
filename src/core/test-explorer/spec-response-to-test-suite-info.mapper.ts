import { SpecCompleteResponse } from "../../model/spec-complete-response";
import { PathFinder, PathFinderOptions } from "../helpers/path-finder";
import { TestSuiteInfo, TestInfo } from "vscode-test-adapter-api";
import * as path from "path";
import { TestExplorerConfiguration } from '../../model/test-explorer-configuration';

const ENCODING = "utf-8";

export class SpecResponseToTestSuiteInfoMapper {
  private readonly pathFinder: PathFinder;
  
  public constructor(private readonly config: TestExplorerConfiguration) {
    const pathFinderOptions: PathFinderOptions = { ignore: config.excludeFiles };
    this.pathFinder = new PathFinder(config.testFiles, pathFinderOptions, ENCODING);
  }

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
      const testFile = specLocation?.file;
      const suiteNode = this.getOrCreateLowerSuiteNode(rootSuiteNode, spec, suiteNames, testFile);
      this.createTest(spec, suiteNode, suiteNames, testFile);
    }

    return rootSuiteNode;
  }

  private getOrCreateLowerSuiteNode(
    node: TestSuiteInfo, 
    spec: SpecCompleteResponse, 
    suiteNames: string[],
    testFile?: string): TestSuiteInfo {

    for (const suiteName of suiteNames) {
      let nextNode = this.findNodeByKey(node, suiteName);
      if (!nextNode) {
        const locationHint = suiteNames.reduce((previousValue: any, currentValue: any, index: number) => {
          if (previousValue === suiteName) {
            spec.suite = [suiteName];
            return suiteName;
          }

          spec.suite = suiteNames;
          return [previousValue, currentValue].join(" ");
        });

        nextNode = this.createSuite(spec, locationHint, testFile);
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
        if (child.label === suiteLookup) {
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

  private createTest(specComplete: SpecCompleteResponse, suiteNode: TestSuiteInfo, suiteNames: string[], testFile?: string) {
    const specLocation = this.pathFinder.getSpecLocation(suiteNames, specComplete.description, testFile);

    suiteNode.children.push({
      type: "test",
      id: specComplete.id,
      fullName: [...suiteNames, specComplete.description].join(" "),
      label: specComplete.description,
      file: specLocation?.file ? path.join(this.config.projectRootPath, specLocation.file) : undefined,
      line: specLocation?.line,
    } as TestInfo);
  }

  private createSuite(specComplete: SpecCompleteResponse, suiteLookup: string, testFile?: string): TestSuiteInfo {
    const suiteName = specComplete.suite[specComplete.suite.length - 1];
    const suiteLocation = this.pathFinder.getSpecLocation(specComplete.suite, undefined, testFile);

    return {
      type: "suite",
      id: suiteLookup,
      fullName: suiteName,
      label: suiteName,
      file: suiteLocation?.file ? path.join(this.config.projectRootPath, suiteLocation.file) : undefined,
      line: suiteLocation?.line,
      children: [],
    } as TestSuiteInfo;
  }
}
