import { DebugLoggingResolver, Logger } from "../util/logger";
import { DefaultTestManager } from "./default-test-manager";
import { ExtensionConfig } from "../core/extension-config";
import { KarmaEventListener } from "../frameworks/karma/integration/karma-event-listener";
import { SpecLocation, SpecLocator } from '../util/spec-locator';
import { SpecLocationResolver, SpecResponseToTestSuiteInfoMapper } from "../frameworks/karma/integration/spec-response-to-test-suite-info-mapper";
import { TestSuiteOrganizer } from "../core/test-suite-organizer";
import { EventEmitter } from "vscode";
import { KarmaServer } from "../frameworks/karma/karma-test-server";
import { KarmaFactory } from "../frameworks/karma/karma-factory";
import { ServerProcessLogger } from "../frameworks/karma/karma-command-line-test-server-executor";
import { TestRunEvent } from "../api/test-events";
import { TestResolver } from "../frameworks/karma/integration/test-resolver";
import { Log } from "vscode-test-adapter-util";
import { TestManager } from "../api/test-manager";
import { AggregatingTestManager } from "./aggregating-test-manager";
import { TestCountProcessor } from "./test-count-processor";
import { SuiteAggregateTestResultEmitter } from "./suite-aggregate-test-result-emitter";
import { TestSuiteMerger } from "./test-suite-merger";

export class TestManagerFactory {

  private disposables: { dispose(): void }[] = [];

  constructor(private readonly logger: Logger) {
    this.disposables.push(this.logger);
  }

  public createTestManager(
    testRunEmitter: EventEmitter<TestRunEvent>,
    specLocator: SpecLocator,
    testResolver: TestResolver,
    config: ExtensionConfig,
    log: Log): TestManager
  {
    const defaultTestManager: DefaultTestManager = this.createDefaultTestManager(
      testRunEmitter,
      specLocator,
      testResolver,
      config,
      log);
    
    const aggregatingTestManager: AggregatingTestManager = this.createAggregatingTestManager(
      [ defaultTestManager ],
      testRunEmitter,
      testResolver); 

    return aggregatingTestManager;
  }

  private createAggregatingTestManager(
    testManagers: TestManager[],
    testRunEmitter: EventEmitter<TestRunEvent>,
    testResolver: TestResolver)
  {
    const testCountProcessor = new TestCountProcessor(this.logger);

    const suiteTestResultEmitter = new SuiteAggregateTestResultEmitter(
      testRunEmitter,
      testResolver,
      testCountProcessor,
      this.logger);

    const testSuiteOrganizer = new TestSuiteOrganizer(this.logger);
    const testSuiteMerger = new TestSuiteMerger(this.logger);

    const aggregatingTestManager = new AggregatingTestManager(
      testManagers,
      testSuiteOrganizer,
      testCountProcessor,
      suiteTestResultEmitter,
      testSuiteMerger,
      this.logger);

    return aggregatingTestManager;
  }

  private createDefaultTestManager(
    testRunEmitter: EventEmitter<TestRunEvent>,
    specLocator: SpecLocator,
    testResolver: TestResolver,
    config: ExtensionConfig,
    log: Log): DefaultTestManager
  {
    const debugModeResolver: DebugLoggingResolver = () => config.debugLevelLoggingEnabled;
    const logger = new Logger(log, debugModeResolver);

    let testManager: DefaultTestManager;

    const karmaServerProcessLogger: ServerProcessLogger = (data: string, serverPort: number) => {
      const regex = new RegExp(/\(.*?)\m/, "g");

      if (testManager?.isTestRunning()) {  // FIXME: This doesn't seem to be logging Karma output as expected
        let log = data.toString().replace(regex, "");
        if (log.startsWith("e ")) {
          log = `HeadlessChrom${log}`;
        }
        logger.info(`${log}`, { divider: `Karma Server:${serverPort} Logs` });
      }
    };

    const karmaFactory = new KarmaFactory(
      config,
      testRunEmitter,
      testResolver,
      logger,
      karmaServerProcessLogger);

    const specLocationResolver: SpecLocationResolver = (suite: string[], description?: string): SpecLocation[] => {
      return specLocator?.getSpecLocation(suite, description) ?? [];
    };
    const testRunEventEmitter = karmaFactory.createTestRunEmitter();
    const karmaEventListener = new KarmaEventListener(testRunEventEmitter, logger);
    // const testSuiteOrganizer = new TestSuiteOrganizer(logger);
    const specToTestSuiteMapper = new SpecResponseToTestSuiteInfoMapper(specLocationResolver, logger);
    const testServerExecutor = karmaFactory.createTestServerExecutor();
    const testRunExecutor = karmaFactory.createTestRunExecutor();
    const testRunner = karmaFactory.createTestRunner(testRunExecutor, karmaEventListener, specToTestSuiteMapper);
    const testServer = new KarmaServer(testServerExecutor, logger);

    testManager = new DefaultTestManager(
      testServer,
      testRunner,
      karmaEventListener,
      // testRunEmitter,
      // testSuiteOrganizer,
      // testResolver,
      logger);

    return testManager;
  }

  public async dispose(): Promise<void> {
    this.disposables.forEach(disposable => disposable.dispose());
  }
}