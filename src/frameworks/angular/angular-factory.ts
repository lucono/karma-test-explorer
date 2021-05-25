import { Logger } from "../../util/logger";
import { ExtensionConfig } from "../../core/extension-config";
import { TestServerExecutor } from "../../api/test-server-executor";
// import { join } from "path";
// import { existsSync } from "fs";
import { AngularTestServerExecutor } from "../angular/angular-test-server-executor";
import { getDefaultAngularProject } from "../angular/angular-config-loader";
import { TestFactory } from "../../api/test-factory";
import { TestRunExecutor } from "../../api/test-run-executor";
import { TestRunner } from "../../api/test-runner";
import { TestServer } from "../../api/test-server";
import { KarmaEventListener } from "../karma/integration/karma-event-listener";
import { SpecResponseToTestSuiteInfoMapper } from "../karma/integration/spec-response-to-test-suite-info-mapper";
import { KarmaCommandLineTestServerExecutorOptions, ServerProcessLogger } from "../karma/karma-command-line-test-server-executor";
import { KarmaFactory } from "../karma/karma-factory";
import { Disposable } from "../../api/disposable";
// import { KarmaFactory } from "../karma/karma-factory";

export class AngularFactory implements TestFactory {

  private readonly karmaFactory: KarmaFactory;
  private disposables: Disposable[] = [];

  public constructor(
    private readonly config: ExtensionConfig,
    private readonly serverProcessLogger: ServerProcessLogger,
    private readonly logger: Logger)
  {
    this.karmaFactory = new KarmaFactory(config, serverProcessLogger, logger);
    this.disposables.push(this.karmaFactory, config, logger);
  }

  public createTestServerExecutor(): TestServerExecutor {
    this.logger.info(`Creating Angular test server executor`);
    
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

  createTestServer(testServerExecutor: TestServerExecutor): TestServer {
    return this.karmaFactory.createTestServer(testServerExecutor);
  }

  createTestRunner(
    testRunExecutor: TestRunExecutor,
    karmaEventListener: KarmaEventListener,
    specToTestSuiteMapper: SpecResponseToTestSuiteInfoMapper): TestRunner
  {
    return this.karmaFactory.createTestRunner(testRunExecutor, karmaEventListener, specToTestSuiteMapper);
  }

  createTestRunExecutor(): TestRunExecutor {
    return this.karmaFactory.createTestRunExecutor();
  }

  public dispose() {
    this.karmaFactory.dispose();

  }
}
