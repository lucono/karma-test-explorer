import { KarmaRunner } from "./karma/karma-runner";
import { KarmaEventListener } from "./integration/karma-event-listener";
import { Logger } from "./helpers/logger";
import { TestSuiteInfo } from "vscode-test-adapter-api";
import { TestExplorerConfiguration } from "../model/test-explorer-configuration";
import { TestServer } from "../model/test-server";
import { PathFinder } from './helpers/path-finder';

export class KarmaTestExplorer {
  private loadedProjectRootPath: string = "";

  public constructor(
    private readonly testServer: TestServer,
    private readonly karmaRunner: KarmaRunner,
    private readonly karmaEventListener: KarmaEventListener,
    private readonly logger: Logger
  ) {}

  public async loadTests(config: TestExplorerConfiguration, pathFinder: PathFinder): Promise<TestSuiteInfo> {
    if (this.karmaRunner.isKarmaRunning()) {
      await this.testServer.stopAsync();
    }

    this.loadedProjectRootPath = await this.testServer.start(config);
    const testSuiteInfo = await this.karmaRunner.loadTests(this.loadedProjectRootPath, pathFinder);

    if (testSuiteInfo.children.length === 0) {
      this.logger.info("Test loading completed - No tests found");
    } else {
      this.logger.info("Test loading completed");
    }

    return testSuiteInfo;
  }

  public async reloadTestDefinitions(pathFinder: PathFinder): Promise<TestSuiteInfo> {
    await this.karmaRunner.loadTests(this.loadedProjectRootPath, pathFinder);

    // FIXME: Is there a workaround for this?
    // We have to call it twice to force karma reload the definitions
    // without having to enable autowatch = true;
    return await this.karmaRunner.loadTests(this.loadedProjectRootPath, pathFinder);
  }

  public async runTests(tests: string[], isComponentRun: boolean): Promise<void> {
    await this.karmaRunner.runTests(tests, isComponentRun);
    this.logger.status(this.karmaEventListener.testStatus);
  }

  public async stopCurrentRun(): Promise<void> {
    if (this.karmaRunner.isKarmaRunning()) {
      await this.testServer.stopAsync();
    }
  }

  public dispose(): void {
    if (this.karmaRunner.isKarmaRunning()) {
      this.testServer.stop();
    }
  }
}
