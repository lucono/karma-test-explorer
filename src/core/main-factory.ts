import { DefaultTestManager } from "./default-test-manager";
import { ExtensionConfig } from "./extension-config";
import { KarmaEventListener } from "../frameworks/karma/runner/karma-event-listener";
import { SpecLocationResolver, SpecResponseToTestSuiteInfoMapper } from "../frameworks/karma/runner/spec-response-to-test-suite-info-mapper";
import { TestSuiteOrganizer } from "./test-suite-organizer";
import { EventEmitter, Uri, workspace } from "vscode";
import { TestRunEvent } from "../api/test-events";
import { TestResolver } from "./test-resolver";
import { TestManager } from "../api/test-manager";
import { AggregatingTestManager } from "./aggregating-test-manager";
import { SuiteAggregateTestResultEmitter } from "./suite-aggregate-test-result-emitter";
import { TestSuiteMerger } from "../util/test-suite-merger";
import { Logger } from "./logger";
// import { Log } from "vscode-test-adapter-util";
import { SpecLocator, SpecLocatorOptions } from "../util/spec-locator";
import { TestRunEventEmitter } from "../frameworks/karma/runner/test-run-event-emitter";
import { PortAcquisitionManager } from "../util/port-acquisition-manager";
import { join } from "path";
import { existsSync } from "fs";
import { AngularTestServerFactory } from "../frameworks/angular/angular-test-server-factory";
import { TestSuiteTreeProcessor } from "../util/test-suite-tree-processor";
import { ShardManager } from "./shard-manager";
import { TestServerFactory } from "../api/test-server-factory";
import { TestRunnerFactory } from "../api/test-runner-factory";
import { CascadingTestServerFactory } from "./cascading-test-server-factory";
import { KarmaTestServerFactory } from "../frameworks/karma/server/karma-test-server-factory";
import { KarmaTestRunnerFactory } from "../frameworks/karma/runner/karma-test-runner-factory";
import { Log } from "./log";

export class MainFactory {

  private disposables: { dispose(): void }[] = [];
  private readonly config: ExtensionConfig;
  private readonly logger: Logger;

  constructor(
    workspaceFolderUri: Uri,
    configPrefix: string,
    private readonly log: Log)
  {
    this.config = this.createConfig(workspaceFolderUri, configPrefix);
    this.logger = new Logger(log, 'TestExplorerFactory', this.config.debugLevelLoggingEnabled);
    this.disposables.push(this.log);
  }

  public getExtensionConfig() {
    return this.config;
  }

  private createConfig(
    workspaceFolderUri: Uri,
    configPrefix: string): ExtensionConfig
  {
    const config = workspace.getConfiguration(configPrefix, workspaceFolderUri);
    const configLogger = new Logger(this.log, 'ExtensionConfig', true);
    return new ExtensionConfig(config, workspaceFolderUri.path, configLogger);
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
    testRunEmitter: EventEmitter<TestRunEvent>,
    specLocationResolver: SpecLocationResolver,
    testResolver: TestResolver,
    serverInstances: number = 1): TestManager
  {
    // let testManager: DefaultTestManager;
    // const serverProcessLogger = makeShardLogger(`ServerProcessLogger`);

    // const karmaServerProcessLogger: ServerProcessLogger = (data: string, serverPort: number) => {
    //   const regex = new RegExp(/\(.*?)\m/, "g");

    //   if (testManager?.isTestRunning()) {  // FIXME: This doesn't seem to be logging Karma output as expected
    //     let log = data.toString().replace(regex, "");
    //     if (log.startsWith("e ")) {
    //       log = `HeadlessChrom${log}`;
    //     }
    //     serverProcessLogger.info(`${log}`, { divider: `Karma Server:${serverPort} Logs` });
    //   }
    // };

    const prioritizedTestServerFactories: Partial<TestServerFactory>[] = [];

    prioritizedTestServerFactories.unshift(new KarmaTestServerFactory(
      this.config,
      // karmaServerProcessLogger,
      new Logger(this.log, `KarmaTestServerFactory`, this.config.debugLevelLoggingEnabled)
    ));

    if (this.isAngularProject()) {
      prioritizedTestServerFactories.unshift(new AngularTestServerFactory(
        this.config,
        // karmaServerProcessLogger,
        new Logger(this.log, `AngularTestServerFactory`, this.config.debugLevelLoggingEnabled)
      ));
    }

    const testServerFactory: TestServerFactory = new CascadingTestServerFactory(
      prioritizedTestServerFactories,
      new Logger(this.log, `CascadingTestServerFactory`, this.config.debugLevelLoggingEnabled)
    );

    // const testRunnerFactory: TestRunnerFactory = new KarmaTestRunnerFactory(
    //   this.config,
    //   new Logger(this.log, `KarmaTestRunnerFactory`, this.config.debugLevelLoggingEnabled)
    // )

    const testFramework = 'jasmine'; // FIXME: Only jasmine framework supports sharding. Get actual framework from extension config

    const testManagers: TestManager[] = [];
    const portManager = new PortAcquisitionManager(new Logger(this.log, `PortManager`, this.config.debugLevelLoggingEnabled));
    const totalServerShards = testFramework === 'jasmine' && serverInstances > 0 ? serverInstances : 1;
    let shardIndex = 0;

    while (shardIndex < totalServerShards) {
      this.logger.info(
        `Creating ${shardIndex + 1} of ${totalServerShards} ` +
        `sharded karma instances (shard ${shardIndex})`);

      testManagers.push(this.createDefaultTestManager(
        testServerFactory,
        testRunnerFactory,
        testRunEmitter,
        specLocationResolver,
        testResolver,
        portManager,
        shardIndex,
        totalServerShards));

      shardIndex++;
    }

    const shardManager = new ShardManager(totalServerShards, new Logger(
      this.log,
      'ShardManager',
      this.config.debugLevelLoggingEnabled)
    );

    const aggregatingTestManager = this.createAggregatingTestManager(
      testManagers,
      shardManager,
      testRunEmitter,
      testResolver); 

    return aggregatingTestManager;
  }

  private createAggregatingTestManager(
    testManagers: TestManager[],
    shardManager: ShardManager,
    testRunEmitter: EventEmitter<TestRunEvent>,
    testResolver: TestResolver): AggregatingTestManager
  {
    const testSuiteTreeProcessor = new TestSuiteTreeProcessor(new Logger(
      this.log,
      'TestCountProcessor',
      this.config.debugLevelLoggingEnabled));

    const suiteTestResultEmitter = new SuiteAggregateTestResultEmitter(
      testRunEmitter,
      testResolver,
      testSuiteTreeProcessor,
      new Logger(
        this.log,
        'SuiteAggregateTestResultEmitter',
        this.config.debugLevelLoggingEnabled));

    const testSuiteOrganizer = new TestSuiteOrganizer(new Logger(
      this.log,
      'TestSuiteOrganizer',
      this.config.debugLevelLoggingEnabled));

    const testSuiteMerger = new TestSuiteMerger(new Logger(
      this.log,
      'TestSuiteMerger',
      this.config.debugLevelLoggingEnabled));

    const aggregatingTestManager = new AggregatingTestManager(
      testManagers,
      shardManager,
      testSuiteOrganizer,
      testSuiteTreeProcessor,
      suiteTestResultEmitter,
      testSuiteMerger,
      this.config.testGrouping,
      this.config.projectRootPath,
      new Logger(this.log, 'AggregatingTestManager', this.config.debugLevelLoggingEnabled));

    return aggregatingTestManager;
  }

  private createDefaultTestManager(
    testServerFactory: TestServerFactory,
    testRunnerFactory: TestRunnerFactory,
    testRunEmitter: EventEmitter<TestRunEvent>,
    specLocationResolver: SpecLocationResolver,
    testResolver: TestResolver,
    portManager: PortAcquisitionManager,
    serverShardIndex: number = 0,
    totalServerShards: number = 1): DefaultTestManager
  {
    const makeShardLogger = (loggerName: string): Logger => {
      const shardLoggerName = totalServerShards > 1
        ? `${loggerName}-${serverShardIndex}`
        : `${loggerName}`;

      return new Logger(this.log, shardLoggerName, this.config.debugLevelLoggingEnabled);
    };

    // let testManager: DefaultTestManager;
    // const serverProcessLogger = makeShardLogger(`ServerProcessLogger`);

    // const karmaServerProcessLogger: ServerProcessLogger = (data: string, serverPort: number) => {
    //   const regex = new RegExp(/\(.*?)\m/, "g");

    //   if (testManager?.isTestRunning()) {  // FIXME: This doesn't seem to be logging Karma output as expected
    //     let log = data.toString().replace(regex, "");
    //     if (log.startsWith("e ")) {
    //       log = `HeadlessChrom${log}`;
    //     }
    //     serverProcessLogger.info(`${log}`, { divider: `Karma Server:${serverPort} Logs` });
    //   }
    // };

    // const prioritizedTestServerFactories: Partial<TestServerFactory>[] = [];

    // prioritizedTestServerFactories.unshift(new KarmaTestServerFactory(
    //   this.config,
    //   karmaServerProcessLogger,
    //   new Logger(this.log, `KarmaTestServerFactory`, this.config.debugLevelLoggingEnabled)
    // ));

    // if (this.isAngularProject()) {
    //   prioritizedTestServerFactories.unshift(new AngularTestServerFactory(
    //     this.config,
    //     karmaServerProcessLogger,
    //     new Logger(this.log, `AngularTestServerFactory`, this.config.debugLevelLoggingEnabled)
    //   ));
    // }

    // const testServerFactory: TestServerFactory = new CascadingTestServerFactory(
    //   prioritizedTestServerFactories,
    //   new Logger(this.log, `CascadingTestServerFactory`, this.config.debugLevelLoggingEnabled)
    // );

    // const testRunnerFactory: TestRunnerFactory = new KarmaTestRunnerFactory(
    //   this.config,
    //   new Logger(this.log, `KarmaTestRunnerFactory`, this.config.debugLevelLoggingEnabled)
    // )

    const specToTestSuiteMapper = new SpecResponseToTestSuiteInfoMapper(
      specLocationResolver,
      makeShardLogger(`SpecResponseToTestSuiteInfoMapper`)
    );
    const testRunEventEmitter = new TestRunEventEmitter(testRunEmitter, testResolver);
    const karmaEventListener = new KarmaEventListener(testRunEventEmitter, makeShardLogger('KarmaEventListener'));

    const testServerExecutor = testServerFactory.createTestServerExecutor(serverShardIndex, totalServerShards);
    const testServer = testServerFactory.createTestServer(testServerExecutor);

    const testRunExecutor = testRunnerFactory.createTestRunExecutor();
    const testRunner = testRunnerFactory.createTestRunner(karmaEventListener, specToTestSuiteMapper, testRunExecutor);

    const testManager = new DefaultTestManager(
      testServer,
      testRunner,
      karmaEventListener,
      portManager,
      this.config.karmaPort,
      this.config.defaultSocketConnectionPort,
      makeShardLogger(`DefaultTestManager`));

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