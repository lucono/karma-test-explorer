import { EventEmitter } from "vscode";
import { TestInfo, TestSuiteInfo } from "vscode-test-adapter-api";
// import { Log } from "vscode-test-adapter-util";
import { TestRunEvent } from "../../../api/test-events";
import { TestType } from "../../../api/test-infos";
import { TestRunnerFactory } from "../../../api/test-runner-factory";
import { Logger } from "../../../core/logger";
import { MainFactory } from "../../../core/main-factory";
import { TestResolver } from "../../../core/test-resolver";
import { SpecLocation } from "../../../util/spec-locator";
import { KarmaEventListener } from "../runner/karma-event-listener";
import { SpecLocationResolver, SpecResponseToTestSuiteInfoMapper } from "../runner/spec-response-to-test-suite-info-mapper";
import { TestRunEventEmitter } from "../runner/test-run-event-emitter";
import { KarmaTestRunnerFactory } from "./karma-test-runner-factory";
import { parentPort, workerData } from "worker_threads";
import { Uri } from "vscode";
import { KarmaRunnerWorkerData } from "./karma-runner-worker-data";
import { KarmaRunnerWorkerLogResponse, KarmaRunnerWorkerRequestType, KarmaRunnerWorkerResponseType, KarmaRunnerWorkerTestRequest } from "./karma-runner-worker-messages";
import { Log } from "../../../core/log";
import { LogLevel } from "../../../core/log-level";

const initWorker = () => {
  if (!parentPort || !workerData) {
    return;
  }

  const testManagerPort = parentPort;
  const {
    workspaceUriString,
    configPrefix,
    serverPort,
    serverShardIndex,
    totalServerShards,
    config
  }: KarmaRunnerWorkerData = workerData;
  
  let loadedRootSuite: TestSuiteInfo | undefined;
  let loadedTestsById: Map<string, TestInfo | TestSuiteInfo> = new Map();

  const testRunEmitter = new EventEmitter<TestRunEvent>();
  
  const storeLoadedTests = (rootSuite?: TestSuiteInfo) => {
    const testsById: Map<string, TestInfo | TestSuiteInfo> = new Map();

    const processTestTree = (test: TestInfo | TestSuiteInfo): void => {
      testsById.set(test.id, test);
      if (test.type === TestType.Suite && test.children?.length) {
        test.children.forEach(childTest => processTestTree(childTest));
      }
    };

    if (rootSuite) {
      processTestTree(rootSuite);
    }
    loadedRootSuite = rootSuite;
    loadedTestsById = testsById;
    loadedRootSuite = rootSuite;
  }

  const logMessage = (message: string, logLevel: LogLevel) => {
    const logResponse: KarmaRunnerWorkerLogResponse = {
      type: KarmaRunnerWorkerResponseType.LogMessage,
      logLevel,
      message
    };
    testManagerPort.postMessage(logResponse);
  };

  const log: Log = {
    info: (msg: string) => logMessage(msg, LogLevel.INFO),
    debug: (msg: string) => logMessage(msg, LogLevel.DEBUG),
    warn: (msg: string) => logMessage(msg, LogLevel.WARN),
    error: (msg: string) => logMessage(msg, LogLevel.ERROR),
    dispose: () => {}
  };
  
  const workspaceUri: Uri = Uri.parse(workspaceUriString);
  const mainFactory = new MainFactory(workspaceUri, configPrefix, log);
  const specLocator = mainFactory.fetchTestInfo();
  
  const specLocationResolver: SpecLocationResolver = (suite: string[], description?: string): SpecLocation[] => {
    return specLocator.getSpecLocation(suite, description) ?? [];
  };
  
  const makeShardLogger = (loggerName: string): Logger => {
    const shardLoggerName = totalServerShards > 1
      ? `${loggerName}-${serverShardIndex}`
      : `${loggerName}`;
  
    return new Logger(log, shardLoggerName, config.debugLevelLoggingEnabled);
  };
  
  const specToTestSuiteMapper = new SpecResponseToTestSuiteInfoMapper(
    specLocationResolver,
    makeShardLogger(`SpecResponseToTestSuiteInfoMapper`)
  );
  
  const testResolver: TestResolver = {
    resolveTest: (testId: string): TestInfo | undefined => {
      const test = loadedTestsById.get(testId);
      return test?.type === TestType.Test ? test : undefined;
    },
  
    resolveTestSuite: (testSuiteId: string): TestSuiteInfo | undefined => {
      const testSuite = loadedTestsById.get(testSuiteId);
      return testSuite?.type === TestType.Suite ? testSuite : undefined;
    }
  };
  
  const testRunnerFactory: TestRunnerFactory = new KarmaTestRunnerFactory(config, new Logger(
    log, `KarmaTestRunnerFactory`, config.debugLevelLoggingEnabled
  ));
  
  const testRunEventEmitter = new TestRunEventEmitter(testRunEmitter, testResolver);
  const karmaEventListener = new KarmaEventListener(testRunEventEmitter, makeShardLogger('KarmaEventListener'));
  const testRunExecutor = testRunnerFactory.createTestRunExecutor();
  const testRunner = testRunnerFactory.createTestRunner(karmaEventListener, specToTestSuiteMapper, testRunExecutor);
  
  testManagerPort.on(`message`, (request: KarmaRunnerWorkerTestRequest) => {
    if (request.type === KarmaRunnerWorkerRequestType.LoadTests) {
      testRunner.loadTests(serverPort).then(loadedTests => {
        storeLoadedTests(loadedTests);
        testManagerPort.postMessage(loadedTests);
      });

    } else if (request.type === KarmaRunnerWorkerRequestType.RunTests) {
      testRunner.runTests(serverPort, request.tests).then(testResults => testManagerPort.postMessage(testResults));
    }
  });  
}

initWorker();
