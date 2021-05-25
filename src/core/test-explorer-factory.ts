import { DefaultTestManager } from "./default-test-manager";
import { ExtensionConfig } from "./extension-config";
import { KarmaEventListener } from "../frameworks/karma/integration/karma-event-listener";
import { SpecLocationResolver, SpecResponseToTestSuiteInfoMapper } from "../frameworks/karma/integration/spec-response-to-test-suite-info-mapper";
import { TestSuiteOrganizer } from "./test-suite-organizer";
import { EventEmitter, workspace, WorkspaceFolder } from "vscode";
import { KarmaFactory } from "../frameworks/karma/karma-factory";
import { ServerProcessLogger } from "../frameworks/karma/karma-command-line-test-server-executor";
import { TestRunEvent } from "../api/test-events";
import { TestResolver } from "../frameworks/karma/integration/test-resolver";
import { TestManager } from "../api/test-manager";
import { AggregatingTestManager } from "./aggregating-test-manager";
import { TestCountProcessor } from "./test-count-processor";
import { SuiteAggregateTestResultEmitter } from "./suite-aggregate-test-result-emitter";
import { TestSuiteMerger } from "./test-suite-merger";
import { Logger } from "../util/logger";
import { Log } from "vscode-test-adapter-util";
import { SpecLocator, SpecLocatorOptions } from "../util/spec-locator";
import { TestFactory } from "../api/test-factory";
import { TestRunEventEmitter } from "../frameworks/karma/integration/test-run-event-emitter";
import { PortManager } from "./port-manager";

export class TestExplorerFactory {

  private disposables: { dispose(): void }[] = [];
  private readonly config: ExtensionConfig;
  private readonly logger: Logger;

  constructor(
    workspaceFolder: WorkspaceFolder,
    configPrefix: string,
    private readonly log: Log)
  {
    this.config = this.createConfig(workspaceFolder, configPrefix);
    this.logger = new Logger(log, 'TestExplorerFactory', this.config.debugLevelLoggingEnabled);
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
    const configLogger = new Logger(this.log, 'ExtensionConfig', true);
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
    testRunEmitter: EventEmitter<TestRunEvent>,
    specLocationResolver: SpecLocationResolver,
    testResolver: TestResolver,
    serverInstances: number = 1): TestManager
  {
    const testFramework = 'jasmine'; // FIXME: Only jasmine framework supports sharding. Get actual framework from extension config

    const testManagers: TestManager[] = [];
    const portManager = new PortManager(new Logger(this.log, `PortManager`, this.config.debugLevelLoggingEnabled));
    const totalServerShards = testFramework === 'jasmine' && serverInstances > 0 ? serverInstances : 1;
    let shardIndex = 0;

    while (shardIndex < totalServerShards) {
      this.logger.info(`Creating ${shardIndex} of ${totalServerShards} sharded karma instances`);

      testManagers.push(this.createDefaultTestManager(
        testRunEmitter,
        specLocationResolver,
        testResolver,
        portManager,
        shardIndex,
        totalServerShards));

      shardIndex++;
    }

    const aggregatingTestManager: AggregatingTestManager = this.createAggregatingTestManager(
      testManagers,
      testRunEmitter,
      testResolver); 

    return aggregatingTestManager;
  }

  private createAggregatingTestManager(
    testManagers: TestManager[],
    testRunEmitter: EventEmitter<TestRunEvent>,
    testResolver: TestResolver)
  {
    const testCountProcessor = new TestCountProcessor(new Logger(
      this.log,
      'TestCountProcessor',
      this.config.debugLevelLoggingEnabled));

    const suiteTestResultEmitter = new SuiteAggregateTestResultEmitter(
      testRunEmitter,
      testResolver,
      testCountProcessor,
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
      testSuiteOrganizer,
      testCountProcessor,
      suiteTestResultEmitter,
      testSuiteMerger,
      this.config.testGrouping,
      this.config.projectRootPath,
      new Logger(this.log, 'AggregatingTestManager', this.config.debugLevelLoggingEnabled));

    return aggregatingTestManager;
  }

  private createDefaultTestManager(
    testRunEmitter: EventEmitter<TestRunEvent>,
    specLocationResolver: SpecLocationResolver,
    testResolver: TestResolver,
    portManager: PortManager,
    serverShardIndex: number = 0,
    totalServerShards: number = 1): DefaultTestManager
  {
    const makeShardLogger = (loggerName: string): Logger => {
      const shardLoggerName = totalServerShards > 1
        ? `${loggerName}-${serverShardIndex}`
        : `${loggerName}`;

      return new Logger(this.log, shardLoggerName, this.config.debugLevelLoggingEnabled);
    };

    let testManager: DefaultTestManager;
    const serverProcessLogger = makeShardLogger(`ServerProcessLogger`);

    const karmaServerProcessLogger: ServerProcessLogger = (data: string, serverPort: number) => {
      const regex = new RegExp(/\(.*?)\m/, "g");

      if (testManager?.isTestRunning()) {  // FIXME: This doesn't seem to be logging Karma output as expected
        let log = data.toString().replace(regex, "");
        if (log.startsWith("e ")) {
          log = `HeadlessChrom${log}`;
        }
        serverProcessLogger.info(`${log}`, { divider: `Karma Server:${serverPort} Logs` });
      }
    };

    const testFactory: TestFactory = new KarmaFactory(
      this.config,
      karmaServerProcessLogger,
      makeShardLogger(`TestFactory`)
    );
    const specToTestSuiteMapper = new SpecResponseToTestSuiteInfoMapper(
      specLocationResolver,
      makeShardLogger(`SpecResponseToTestSuiteInfoMapper`)
    );
    const testRunEventEmitter = new TestRunEventEmitter(testRunEmitter, testResolver);
    const karmaEventListener = new KarmaEventListener(testRunEventEmitter, makeShardLogger('KarmaEventListener'));
    const testServerExecutor = testFactory.createTestServerExecutor(serverShardIndex, totalServerShards);
    const testRunExecutor = testFactory.createTestRunExecutor();
    const testRunner = testFactory.createTestRunner(testRunExecutor, karmaEventListener, specToTestSuiteMapper);
    const testServer = testFactory.createTestServer(testServerExecutor);

    testManager = new DefaultTestManager(
      testServer,
      testRunner,
      karmaEventListener,
      portManager,
      this.config.karmaPort,
      this.config.defaultSocketConnectionPort,
      makeShardLogger(`DefaultTestManager`));

    return testManager;
  }

  public async dispose(): Promise<void> {
    this.disposables.forEach(disposable => disposable.dispose());
  }
}