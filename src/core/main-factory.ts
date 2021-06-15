import { DefaultTestManager } from "./default-test-manager";
import { ExtensionConfig } from "./extension-config";
import { KarmaEventListener } from "../frameworks/karma/runner/karma-event-listener";
import { SpecLocationResolver, SpecResponseToTestSuiteInfoMapper } from "../frameworks/karma/runner/spec-response-to-test-suite-info-mapper";
import { TestSuiteOrganizer } from "./test-suite-organizer";
import { EventEmitter, window, workspace, WorkspaceFolder } from "vscode";
import { KarmaFactory } from "../frameworks/karma/karma-factory";
import { ServerProcessLogger } from "../frameworks/karma/server/karma-command-line-test-server-executor";
import { TestRunEvent } from "../api/test-events";
import { TestResolver } from "./test-resolver";
import { SuiteAggregateTestResultProcessor } from "./suite-aggregate-test-result-processor";
import { Logger } from "./logger";
import { SpecLocator, SpecLocatorOptions } from "../util/spec-locator";
import { TestFactory } from "../api/test-factory";
import { PortAcquisitionManager } from "../util/port-acquisition-manager";
import { join } from "path";
import { existsSync } from "fs";
import { AngularFactory } from "../frameworks/angular/angular-factory";
import { CascadingTestFactory } from "./cascading-test-factory";
import { TestSuiteTreeProcessor } from "../util/test-suite-tree-processor";
import { Log } from "./log";
import { KarmaTestRunEventProcessor } from "../frameworks/karma/runner/karma-test-run-event-processor";

export class MainFactory {

  private disposables: { dispose(): void }[] = [];
  private readonly config: ExtensionConfig;
  private readonly logger: Logger;

  constructor(
    workspaceFolder: WorkspaceFolder,
    configPrefix: string,
    private readonly log: Log)
  {
    this.config = this.createConfig(workspaceFolder, configPrefix);
    this.logger = new Logger(log, MainFactory.name, this.config.debugLevelLoggingEnabled);
    this.disposables.push(this.log);
  }

  public getExtensionConfig() {
    return this.config;
  }

  private createConfig(
    workspaceFolder: WorkspaceFolder,
    configPrefix: string): ExtensionConfig
  {
    const config = workspace.getConfiguration(configPrefix, workspaceFolder.uri);
    const configLogger = new Logger(this.log, ExtensionConfig.name, true);
    return new ExtensionConfig(config, workspaceFolder.uri.path, configLogger);
  }

  public fetchTestInfo(): SpecLocator {
    this.logger.info(`Loading test info from test files`);

    const specLocatorOptions: SpecLocatorOptions = {
      ignore: this.config.excludeFiles,
      cwd: this.config.projectRootPath
    };
    return new SpecLocator(this.config.testFiles, this.logger, specLocatorOptions);
  }

  public createTestManager(
    testRunEventEmitter: EventEmitter<TestRunEvent>,
    specLocationResolver: SpecLocationResolver,
    testResolver: TestResolver): DefaultTestManager
  {
    const createLogger = (loggerName: string): Logger => {
      return new Logger(this.log, loggerName, this.config.debugLevelLoggingEnabled);
    };

    const testRunEventProcessor = new KarmaTestRunEventProcessor(
      testRunEventEmitter,
      testResolver,
      createLogger(KarmaTestRunEventProcessor.name
    ));

    const portManager = new PortAcquisitionManager(createLogger(PortAcquisitionManager.name));

    let testManager: DefaultTestManager;
    // const serverProcessLogger = createLogger(`KarmaServerProcessLogger`);
    const karmaOutputChannel = window.createOutputChannel(`Karma Server`);

    const karmaServerProcessLogger: ServerProcessLogger = (data: string, serverPort: number) => {
      const regex = new RegExp(/\(.*?)\m/, "g");

      if (testManager?.isTestRunning()) {  // FIXME: This doesn't seem to be logging Karma output as expected
        let log = data.toString().replace(regex, "");
        if (log.startsWith("e ")) {
          log = `HeadlessChrom${log}`;
        }
        // serverProcessLogger.info(`${log}`, { divider: `Karma Server:${serverPort} Logs` });
        karmaOutputChannel.append(`\n\n[karma:${serverPort}] ${data}`);
      }
    };

    const prioritizedTestFactories: Partial<TestFactory>[] = [];

    prioritizedTestFactories.unshift(new KarmaFactory(
      this.config,
      karmaServerProcessLogger,
      createLogger(KarmaFactory.name)
    ));

    if (this.isAngularProject()) {
      prioritizedTestFactories.unshift(new AngularFactory(
        this.config,
        karmaServerProcessLogger,
        createLogger(AngularFactory.name)
      ));
    }

    const testFactory: TestFactory = new CascadingTestFactory(prioritizedTestFactories, createLogger(CascadingTestFactory.name));

    const specToTestSuiteMapper = new SpecResponseToTestSuiteInfoMapper(
      specLocationResolver,
      createLogger(SpecResponseToTestSuiteInfoMapper.name)
    );
    const karmaEventListener = new KarmaEventListener(testRunEventProcessor, createLogger(KarmaEventListener.name));
    const testServerExecutor = testFactory.createTestServerExecutor();
    const testRunExecutor = testFactory.createTestRunExecutor();
    const testRunner = testFactory.createTestRunner(karmaEventListener, specToTestSuiteMapper, testRunExecutor);
    const testServer = testFactory.createTestServer(testServerExecutor);

    const testSuiteTreeProcessor = new TestSuiteTreeProcessor(createLogger(TestSuiteTreeProcessor.name));

    const suiteTestResultProcessor = new SuiteAggregateTestResultProcessor(
      testRunEventEmitter,
      testResolver,
      testSuiteTreeProcessor,
      createLogger(SuiteAggregateTestResultProcessor.name)
    );

    const testSuiteOrganizer = new TestSuiteOrganizer(createLogger(TestSuiteOrganizer.name));

    testManager = new DefaultTestManager(
      testServer,
      testRunner,
      karmaEventListener,
      portManager,
      testSuiteOrganizer,
      testSuiteTreeProcessor,
      suiteTestResultProcessor,
      this.config.testGrouping,
      this.config.projectRootPath,
      this.config.karmaPort,
      this.config.defaultSocketConnectionPort,
      createLogger(DefaultTestManager.name)
    );

    return testManager;
  }

  private isAngularProject(): boolean {
    const angularJsonPath = join(this.config.projectRootPath, "angular.json");
    const angularCliJsonPath = join(this.config.projectRootPath, ".angular-cli.json");
    const isAngularProject = (existsSync(angularJsonPath) || existsSync(angularCliJsonPath));

    this.logger.info(`Project detected to ${isAngularProject ? 'be' : 'not be'} an Angular project`);

    return isAngularProject;
  }

  public async dispose(): Promise<void> {
    this.disposables.forEach(disposable => disposable.dispose());
  }
}