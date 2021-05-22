import { Logger } from "../../util/logger";
import { ExtensionConfig } from "../../core/extension-config";
import { TestRunExecutor } from "../../api/test-run-executor";
import { TestServerExecutor } from "../../api/test-server-executor";
import { KarmaCommandLineTestRunExecutor } from "./karma-command-line-test-run-executor";
import { KarmaHttpTestRunExecutor } from "./karma-http-test-run-executor";
import { TestRunner } from "../../api/test-runner";
import { KarmaEventListener } from "./integration/karma-event-listener";
import { SpecResponseToTestSuiteInfoMapper } from "./integration/spec-response-to-test-suite-info-mapper";
import { KarmaTestRunner } from "./karma-test-runner";
import { join } from "path";
import { existsSync } from "fs";
import { AngularTestServerExecutor } from "../angular/angular-test-server-executor";
import { getDefaultAngularProject } from "../angular/angular-config-loader";
import { KarmaCommandLineTestServerExecutor, KarmaCommandLineTestServerExecutorOptions, ServerProcessLogger } from "./karma-command-line-test-server-executor";
import { TestRetriever, TestRunEventEmitter } from "./integration/test-run-event-emitter";
import { EventEmitter } from "vscode";
import { TestRunEvent } from "../../api/test-events";

export class KarmaFactory {
  public constructor(
    private readonly config: ExtensionConfig,
    private readonly testRunEmitter: EventEmitter<TestRunEvent>,
    private readonly testRetriever: TestRetriever,
    private readonly logger: Logger,
    private readonly serverProcessLogger: ServerProcessLogger
  ) {}

  createTestRunEmitter(): TestRunEventEmitter {
    return new TestRunEventEmitter(this.testRunEmitter, this.testRetriever)
  }

  public createTestRunner(
    testRunExecutor: TestRunExecutor,
    karmaEventListener: KarmaEventListener,
    specToTestSuiteMapper: SpecResponseToTestSuiteInfoMapper): TestRunner
  {
    return new KarmaTestRunner(testRunExecutor, karmaEventListener, specToTestSuiteMapper, this.logger);
  }

  public createTestServerExecutor(): TestServerExecutor {
    return this.isAngularProject()
      ? this.createAngularTestServerExecutor()
      : this.createKarmaCommandLineTestServerExecutor();
  }

  public createTestRunExecutor(): TestRunExecutor {
    return this.config.karmaProcessExecutable
      ? this.createKarmaCommandLineTestRunExecutor()
      : new KarmaHttpTestRunExecutor(this.logger);
  }

  private createKarmaCommandLineTestRunExecutor(): KarmaCommandLineTestRunExecutor {
    const environment: { [key: string]: string | undefined } = {
      ...process.env,
      ...this.config.envFileEnvironment,
      ...this.config.env
    };
    return new KarmaCommandLineTestRunExecutor(
      this.config.projectRootPath,
      this.config.baseKarmaConfFilePath,
      this.config.userKarmaConfFilePath,
      { environment },
      this.logger);
  }

  private createKarmaCommandLineTestServerExecutor(): KarmaCommandLineTestServerExecutor {
    const environment: { [key: string]: string | undefined } = {
      ...process.env,
      ...this.config.envFileEnvironment,
      ...this.config.env
    };
    const options: KarmaCommandLineTestServerExecutorOptions = {
        environment,
        serverProcessLogger: this.serverProcessLogger,
        serverProcessErrorLogger: this.serverProcessLogger
    };

    return new KarmaCommandLineTestServerExecutor(
      this.config.projectRootPath,
      this.config.baseKarmaConfFilePath,
      this.config.userKarmaConfFilePath,
      options,
      this.logger);
  }

  private createAngularTestServerExecutor(): AngularTestServerExecutor {
    const angularProject = getDefaultAngularProject(this.config.projectRootPath);

    const environment: { [key: string]: string | undefined } = {
      ...process.env,
      ...this.config.envFileEnvironment,
      ...this.config.env
    };
    const options: KarmaCommandLineTestServerExecutorOptions = {
        environment,
        serverProcessLogger: this.serverProcessLogger,
        serverProcessErrorLogger: this.serverProcessLogger
    };

    return new AngularTestServerExecutor(
      angularProject,
      this.config.projectRootPath,
      this.config.baseKarmaConfFilePath,
      options,
      this.logger);
  }

  private isAngularProject(): boolean {
    const angularJsonPath = join(this.config.projectRootPath, "angular.json");
    const angularCliJsonPath = join(this.config.projectRootPath, ".angular-cli.json");

    return (existsSync(angularJsonPath) || existsSync(angularCliJsonPath));
  }
}
