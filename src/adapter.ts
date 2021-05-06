import { DebugLoggingResolver, Logger } from "./core/helpers/logger";
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
import { Log } from "vscode-test-adapter-util";
import { TestType } from "./model/enums/test-type.enum";
import { KarmaTestExplorer } from "./core/karma-test-explorer";
import { TestExplorerConfiguration } from "./model/test-explorer-configuration";
import * as vscode from "vscode";
import { Debugger } from "./core/test-explorer/debugger";
import { TestRunEventEmitter } from "./core/test-explorer/test-run-event-emitter";
import { KarmaEventListener, TestRetriever } from "./core/integration/karma-event-listener";
import { TestRunnerFactory } from "./core/karma/test-runner-factory";
import { KarmaServer } from "./core/karma/karma-server";
import { SpecLocator, SpecLocatorOptions } from './core/helpers/spec-locator';
import { ConfigSetting } from "./model/enums/config-setting"

export class Adapter implements TestAdapter {

  private config = {} as TestExplorerConfiguration;
  private specLocator?: SpecLocator;
  private isTestProcessRunning: boolean = false;
  private loadedRootSuite?: TestSuiteInfo;
  private loadedTestsById: Map<string, TestInfo | TestSuiteInfo> = new Map();
  private disposables: { dispose(): void }[] = [];
  private readonly retireEmitter = new vscode.EventEmitter<RetireEvent>();
  private readonly testLoadEmitter = new vscode.EventEmitter<TestLoadStartedEvent | TestLoadFinishedEvent>();
  private readonly testRunEmitter = new vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>();
  private readonly autorunEmitter = new vscode.EventEmitter<void>();
  private readonly testExplorer: KarmaTestExplorer;
  private readonly debugger: Debugger;
  private readonly logger: Logger;

  get tests(): vscode.Event<TestLoadStartedEvent | TestLoadFinishedEvent> {
    return this.testLoadEmitter.event;
  }

  get testStates(): vscode.Event<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent> {
    return this.testRunEmitter.event;
  }

  get retire(): vscode.Event<RetireEvent> {
      return this.retireEmitter.event;
  }

  get autorun(): vscode.Event<void> | undefined {
    return this.autorunEmitter.event;
  }

  constructor(public readonly workspace: vscode.WorkspaceFolder, private readonly configPrefix: string, log: Log) {
    const debugModeResolver: DebugLoggingResolver = () => this.config.debugLevelLoggingEnabled;
    this.logger = new Logger(log, debugModeResolver);

    this.logger.info(`Initializing adapter`);

    this.loadConfig(configPrefix);

    const testRetriever: TestRetriever = testId => {
      const test = this.loadedTestsById.get(testId);
      return test?.type === TestType.Test ? test : undefined;
    }
    const testRunEventEmitter = new TestRunEventEmitter(this.testRunEmitter);
    const karmaEventListener = new KarmaEventListener(testRunEventEmitter, testRetriever, this.logger);
    const testRunnerFactory = new TestRunnerFactory(karmaEventListener, this.logger);
    const karmaRunner = testRunnerFactory.createTestRunner();

    const karmaServerProcessLogger = (data: string, serverPort: number) => {
      const regex = new RegExp(/\(.*?)\m/, "g");

      if (this.testExplorer.isTestRunning()) {
        let log = data.toString().replace(regex, "");
        if (log.startsWith("e ")) {
          log = `HeadlessChrom${log}`;
        }
        this.logger.info(`${log}`, { divider: `Karma Server:${serverPort} Logs` });
      }
    };

    const karmaServer = new KarmaServer(this.logger, karmaServerProcessLogger, karmaServerProcessLogger);
    this.testExplorer = new KarmaTestExplorer(karmaServer, karmaRunner, karmaEventListener, this.logger);
    this.debugger = new Debugger(this.logger);

    this.disposables.push(this.testLoadEmitter);
    this.disposables.push(this.testRunEmitter);
    this.disposables.push(this.autorunEmitter);
    this.disposables.push(vscode.workspace.onDidSaveTextDocument(this.handleDocumentSaved, this));
    this.disposables.push(vscode.workspace.onDidChangeConfiguration(this.handleConfigurationChange, this));
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
        `Test ${isHardRefresh ? "hard " : ""}refresh request ignored - ` +
        `Another test operation is currently running`);
      return;
    }
    this.logger.debug(() => `Test ${isHardRefresh ? "hard " : ""}refresh started`);

    this.isTestProcessRunning = true;
    this.testLoadEmitter.fire({ type: "started" } as TestLoadStartedEvent);
    this.specLocator = this.loadTestInfo(this.config.testFiles, this.config.excludeFiles);

    let loadedTests: TestSuiteInfo | undefined;
    let loadError: string | undefined;
    
    try {
      if (isHardRefresh) {
        await this.testExplorer.restart(this.config);
      }
      loadedTests = await this.testExplorer.loadTests(this.config, this.specLocator);
    } catch (error) {
      loadError = `Failed to load tests: ${error?.message ?? error}`;
    }

    const testLoadFinishedEvent: TestLoadFinishedEvent = { type: "finished" };

    if (loadError) {
      this.logger.error(loadError);
      testLoadFinishedEvent.errorMessage = loadError;
    } else if (loadedTests?.children?.length) {
      testLoadFinishedEvent.suite = loadedTests;
    }

    this.storeLoadedTests(loadedTests);
    this.testLoadEmitter.fire(testLoadFinishedEvent);
    this.retireEmitter.fire({} as RetireEvent);

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

    this.testRunEmitter.fire({ type: "started", tests: testIds, testRunId } as TestRunStartedEvent);
    let runError: string | undefined;

    try {
      await this.testExplorer.runTests(this.config, runAllTests ? [] : tests);
    } catch (error) {
      runError = `Failed to run tests: ${error?.message ?? error}`;;
    }

    this.testRunEmitter.fire({ type: "finished", testRunId } as TestRunFinishedEvent);

    if (runError) {
      this.logger.error(runError);
      this.retireEmitter.fire({ tests: testIds } as RetireEvent);
    }

    this.isTestProcessRunning = false;
    this.logger.debug(() => `Test run finished`);
  }

  public async debug(tests: string[]): Promise<void> {
    await this.debugger.manageVSCodeDebuggingSession(this.workspace, this.config.debuggerConfig);
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
    const config = vscode.workspace.getConfiguration(configPrefix, this.workspace.uri);
    this.config = new TestExplorerConfiguration(config, this.workspace.uri.path);
  }

  private loadTestInfo(testFiles: string[], excludeFiles?: string[]): SpecLocator {
    this.logger.info(`Loading test info from test files`);

    const specLocatorOptions: SpecLocatorOptions = {
      ignore: excludeFiles,
      cwd: this.config.projectRootPath
    };
    return new SpecLocator(testFiles, specLocatorOptions);
  }

  private handleConfigurationChange = async (configChangeEvent: vscode.ConfigurationChangeEvent): Promise<void> => {
    this.logger.info(`Configuration changed`);

    const hasRelevantSettingsChange = Object.values(ConfigSetting).reduce(
      (result, setting) => result || configChangeEvent.affectsConfiguration(`${this.configPrefix}.${setting}`, this.workspace.uri),
      false
    );

    if (!hasRelevantSettingsChange) {
      this.logger.info(`No relevant configuration change`);
      return;
    }
    this.logger.info(`Reloading tests with updated configuration`);
    this.loadConfig(this.configPrefix);
    await this.reload();
  }

  private handleDocumentSaved = async (document:vscode.TextDocument): Promise<void> => {
    const savedFile = document.uri.fsPath;

    this.logger.debug(() => `Handling document saved: ${savedFile}`);

    if (!this.config) {
      this.logger.debug(() => `Document saved handler - config not present. Skipping.`);
      return;
    }

    const reloadTriggerFiles = this.config.reloadOnKarmaConfigurationFileChange
      ? [this.config.userKarmaConfFilePath, ...this.config.reloadWatchedFiles]
      : this.config.reloadWatchedFiles;

    if (reloadTriggerFiles.includes(savedFile)) {
      this.logger.info(`Reloading - monitored file changed: ${savedFile}`);
      await this.reload();
      return;
    }

    if (this.specLocator?.isSpecFile(savedFile)) {
      this.logger.info(`Reloading - spec file changed: ${savedFile}`);
      const savedSpecFileInfo = this.specLocator.getSpecFileInfo(savedFile);
      await this.refresh();

      if (savedSpecFileInfo) {
        this.logger.info(`Retiring ${savedSpecFileInfo.specCount} tests from updated spec file: ${savedFile}`);
        this.retireEmitter.fire({ tests: [ savedSpecFileInfo.suiteName ] });
      }
      return;
    }
  }
}