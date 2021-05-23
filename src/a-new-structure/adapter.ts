import {
  TestAdapter,
  TestLoadStartedEvent,
  TestLoadFinishedEvent,
  TestRunStartedEvent,
  TestRunFinishedEvent,
  TestSuiteEvent,
  TestEvent,
  TestInfo,
  TestSuiteInfo,
  RetireEvent
} from "vscode-test-adapter-api";
import { DebugLoggingResolver, Logger } from "./util/logger";
import { Log } from "vscode-test-adapter-util";
import { TestExplorer, TestResolver } from "./core/test-explorer";
import { ExtensionConfig } from "./core/extension-config";
import { Debugger } from "./core/debugger";
import { TestRetriever } from "./frameworks/karma/integration/test-run-event-emitter";
import { KarmaEventListener } from "./frameworks/karma/integration/karma-event-listener";
import { SpecLocation, SpecLocator, SpecLocatorOptions } from './util/spec-locator';
import { ConfigSetting } from "./core/config-setting"
import { SpecLocationResolver, SpecResponseToTestSuiteInfoMapper } from "./frameworks/karma/integration/spec-response-to-test-suite-info-mapper";
import { TestSuiteOrganizer } from "./core/test-suite-organizer";
import { Event, EventEmitter, workspace, ConfigurationChangeEvent, TextDocument, WorkspaceFolder } from "vscode";
import { KarmaServer } from "./frameworks/karma/karma-test-server";
import { TestType } from "./api/test-infos";
import { KarmaFactory } from "./frameworks/karma/karma-factory";
import { ServerProcessLogger } from "./frameworks/karma/karma-command-line-test-server-executor";
import { TestLoadEvent, TestRunEvent } from "./api/test-events";

export class Adapter implements TestAdapter {

  private config = {} as ExtensionConfig;
  private specLocator?: SpecLocator;
  private isTestProcessRunning: boolean = false;
  private loadedRootSuite?: TestSuiteInfo;
  private loadedTestsById: Map<string, TestInfo | TestSuiteInfo> = new Map();
  private disposables: { dispose(): void }[] = [];
  private readonly retireEmitter = new EventEmitter<RetireEvent>();
  private readonly testLoadEmitter = new EventEmitter<TestLoadEvent>();
  private readonly testRunEmitter = new EventEmitter<TestRunEvent>();
  private readonly autorunEmitter = new EventEmitter<void>();
  private readonly testExplorer: TestExplorer;
  private readonly debugger: Debugger;
  private readonly logger: Logger;

  get tests(): Event<TestLoadStartedEvent | TestLoadFinishedEvent> {
    return this.testLoadEmitter.event;
  }

  get testStates(): Event<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent> {
    return this.testRunEmitter.event;
  }

  get retire(): Event<RetireEvent> {
      return this.retireEmitter.event;
  }

  get autorun(): Event<void> | undefined {
    return this.autorunEmitter.event;
  }

  constructor(public readonly workspaceFolder: WorkspaceFolder, private readonly configPrefix: string, log: Log) {
    const debugModeResolver: DebugLoggingResolver = () => this.config.debugLevelLoggingEnabled;
    this.logger = new Logger(log, debugModeResolver);

    this.logger.info(`Initializing adapter`);

    this.loadConfig(configPrefix);

    const karmaServerProcessLogger: ServerProcessLogger = (data: string, serverPort: number) => {
      const regex = new RegExp(/\(.*?)\m/, "g");

      if (this.testExplorer.isTestRunning()) {  // FIXME: This doesn't seem to be logging Karma output as expected
        let log = data.toString().replace(regex, "");
        if (log.startsWith("e ")) {
          log = `HeadlessChrom${log}`;
        }
        this.logger.info(`${log}`, { divider: `Karma Server:${serverPort} Logs` });
      }
    };

    const testRetriever: TestRetriever = (testId: string) => {
      const test = this.loadedTestsById.get(testId);
      return test?.type === TestType.Test ? test : undefined;
    }

    const factory = new KarmaFactory(
      this.config,
      this.testRunEmitter,
      testRetriever,
      this.logger,
      karmaServerProcessLogger);

    const specLocationResolver: SpecLocationResolver = (suite: string[], description?: string): SpecLocation[] => {
      return this.specLocator?.getSpecLocation(suite, description) ?? [];
    };
    const testRunEventEmitter = factory.createTestRunEmitter();
    const karmaEventListener = new KarmaEventListener(testRunEventEmitter, this.logger);
    const testSuiteOrganizer = new TestSuiteOrganizer(this.logger);
    const specToTestSuiteMapper = new SpecResponseToTestSuiteInfoMapper(specLocationResolver, this.logger);
    const testServerExecutor = factory.createTestServerExecutor();
    const testRunExecutor = factory.createTestRunExecutor();
    const testRunner = factory.createTestRunner(testRunExecutor, karmaEventListener, specToTestSuiteMapper);
    const testServer = new KarmaServer(testServerExecutor, this.logger);
    const testResolver: TestResolver = (testSuiteId: string) => this.loadedTestsById.get(testSuiteId);

    this.testExplorer = new TestExplorer(
      testServer,
      testRunner,
      karmaEventListener,
      this.testRunEmitter,
      testSuiteOrganizer,
      testResolver,
      this.logger);

    this.debugger = new Debugger(this.logger);

    this.disposables.push(this.testLoadEmitter);
    this.disposables.push(this.testRunEmitter);
    this.disposables.push(this.autorunEmitter);
    this.disposables.push(workspace.onDidSaveTextDocument(this.handleDocumentSaved, this));
    this.disposables.push(workspace.onDidChangeConfiguration(this.handleConfigurationChange, this));
  }

  public async load(): Promise<void> {
    if (this.isTestProcessRunning) {
      this.logger.debug(() => `New test load request ignored - Another test operation is still running`);
      return;
    }
    this.logger.debug(() => `Test load started`);
    return this.refresh(true);
  }

  private async reload(): Promise<void> {
    this.logger.debug(() => `Test reload started`);

    if (this.isTestProcessRunning) {
      this.logger.debug(() => `Test reload - Aborting previously running test operation`);
      await this.cancel();
    }
    return this.load();
  }

  private async refresh(isHardRefresh: boolean = false): Promise<void> {
    if (this.isTestProcessRunning) {
      this.logger.debug(() => 
        `Test ${isHardRefresh ? 'hard ' : ''}refresh request ignored - ` +
        `Another test operation is currently running`);
      return;
    }
    this.logger.debug(() => `Test ${isHardRefresh ? 'hard ' : ''}refresh started`);

    this.isTestProcessRunning = true;
    this.testLoadEmitter.fire({ type: 'started' } as TestLoadStartedEvent);
    this.specLocator = this.loadTestInfo(this.config.testFiles, this.config.excludeFiles);

    let loadedTests: TestSuiteInfo | undefined;
    let loadError: string | undefined;
    
    try {
      if (isHardRefresh) {
        await this.testExplorer.restart(this.config);
      }
      loadedTests = await this.testExplorer.loadTests(this.config);
    } catch (error) {
      loadError = `Failed to load tests: ${error?.message ?? error}`;
    }

    const testLoadFinishedEvent: TestLoadFinishedEvent = { type: 'finished' };

    if (loadError) {
      this.logger.error(loadError);
      testLoadFinishedEvent.errorMessage = loadError;
    } else if (loadedTests?.children?.length) {
      testLoadFinishedEvent.suite = loadedTests;
    }

    this.storeLoadedTests(loadedTests);
    this.testLoadEmitter.fire(testLoadFinishedEvent);
    this.retireEmitter.fire({});

    this.isTestProcessRunning = false;
    this.logger.debug(() => `Test loading finished`);
  }

  public async run(testIds: string[]): Promise<void> {
    if (this.isTestProcessRunning) {
      this.logger.debug(() => `New test run request ignored - Another test operation is still running`);
      return;
    }
    this.isTestProcessRunning = true;

    this.logger.debug(() => `Test run started`);
    this.logger.info(`Test run is requested for ${testIds.length} test ids: ${JSON.stringify(testIds)}`);

    const tests = testIds
      .map(testId => this.loadedTestsById.get(testId))
      .filter(test => test !== undefined) as (TestInfo | TestSuiteInfo)[];
    
    const runAllTests = this.containsOnlyRootSuite(tests);
    const testRunId: string = Math.random().toString(36).slice(2);

    this.logger.debug(() => 
      `Requested ${testIds.length} test Ids resolved to ${tests.length} actual tests:` +
      `${JSON.stringify(tests)}`);

    this.logger.info(`Starting test run Id: ${testRunId}`);

    this.testRunEmitter.fire({ type: "started", tests: testIds, testRunId });
    let runError: string | undefined;

    try {
      await this.testExplorer.runTests(this.config, runAllTests ? [] : tests);
    } catch (error) {
      runError = `Failed to run tests: ${error?.message ?? error}`;;
    }

    this.testRunEmitter.fire({ type: "finished", testRunId });

    if (runError) {
      this.logger.error(runError);
      this.retireEmitter.fire({ tests: testIds });
    }

    this.isTestProcessRunning = false;
    this.logger.debug(() => `Test run finished`);
  }

  public async debug(tests: string[]): Promise<void> {
    await this.debugger.manageVSCodeDebuggingSession(this.workspaceFolder, this.config.debuggerConfig);
    await this.run(tests);
  }

  public async cancel(): Promise<void> {
    this.logger.debug(() => `Aborting any currently running test operation`);
    await this.testExplorer.stopCurrentRun();
    this.isTestProcessRunning = false;
  }

  public async dispose(): Promise<void> {
    this.testExplorer.dispose();
    this.disposables.forEach(disposable => disposable.dispose());
    this.disposables = [];
  }

  private containsOnlyRootSuite(tests: (TestInfo | TestSuiteInfo)[]): boolean {
    return this.loadedRootSuite !== undefined
      ? tests.length === 1 && tests[0] === this.loadedRootSuite
      : false;
  }

  private storeLoadedTests(rootSuite?: TestSuiteInfo) {
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
    this.loadedRootSuite = rootSuite;
    this.loadedTestsById = testsById;

    this.logger.info(`Loaded ${this.loadedTestsById.size} total tests`);
  }

  private loadConfig(configPrefix: string) {
    const config = workspace.getConfiguration(configPrefix, this.workspaceFolder.uri);
    this.config = new ExtensionConfig(config, this.workspaceFolder.uri.path, this.logger);
  }

  private loadTestInfo(testFiles: string[], excludeFiles?: string[]): SpecLocator {
    this.logger.info(`Loading test info from test files`);

    const specLocatorOptions: SpecLocatorOptions = {
      ignore: excludeFiles,
      cwd: this.config.projectRootPath
    };
    return new SpecLocator(testFiles, specLocatorOptions);
  }

  private handleConfigurationChange = async (configChangeEvent: ConfigurationChangeEvent): Promise<void> => {
    this.logger.info(`Configuration changed`);

    const hasRelevantSettingsChange = Object.values(ConfigSetting).some(setting => {
      const settingChanged = configChangeEvent.affectsConfiguration(`${this.configPrefix}.${setting}`, this.workspaceFolder.uri);
      if (settingChanged) {
        this.logger.debug(() => `Relevant changed config setting: ${setting}`);
      }
      return settingChanged;
    });

    if (!hasRelevantSettingsChange) {
      this.logger.info(`No relevant configuration change`);
      return;
    }
    this.logger.info(`Reloading tests with updated configuration`);
    this.loadConfig(this.configPrefix);
    await this.reload();
  }

  private handleDocumentSaved = async (document: TextDocument): Promise<void> => {
    const savedFile = document.uri.fsPath;

    this.logger.debug(() => `Document saved: ${savedFile}`);

    if (!this.config) {
      this.logger.debug(() => `Document saved handler - config not present. Aborting.`);
      return;
    }

    const reloadTriggerFiles = [ ...this.config.reloadWatchedFiles ];
    
    if (this.config.reloadOnKarmaConfigurationFileChange) {
      reloadTriggerFiles.push(this.config.userKarmaConfFilePath);
    }
    if (this.config.envFile) {
      reloadTriggerFiles.push(this.config.envFile);
    }

    if (reloadTriggerFiles.includes(savedFile)) {
      this.logger.info(`Reloading - monitored file changed: ${savedFile}`);
      await this.reload();

    } else if (this.specLocator?.isSpecFile(savedFile)) {
      this.logger.info(`Reloading - spec file changed: ${savedFile}`);
      // const savedSpecFileInfo = this.specLocator.getSpecFileInfo(savedFile);
      await this.refresh();

      // if (savedSpecFileInfo) {
      //   this.logger.info(`Retiring ${savedSpecFileInfo.specCount} tests from updated spec file: ${savedFile}`);
      //   this.retireEmitter.fire({ tests: [ savedSpecFileInfo.suiteName ] });
      // }
    }
  }
}