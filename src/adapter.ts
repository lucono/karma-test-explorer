import { Logger } from "./core/helpers/logger";
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
  RetireEvent,
  TestType
} from "vscode-test-adapter-api";
import { Log } from "vscode-test-adapter-util";
import { KarmaTestExplorer } from "./core/karma-test-explorer";
import { TestExplorerConfiguration } from "./model/test-explorer-configuration";
import * as vscode from "vscode";
import { Debugger } from "./core/test-explorer/debugger";
import { TestRunEventEmitter } from "./core/test-explorer/test-run-event-emitter";
import { KarmaEventListener } from "./core/integration/karma-event-listener";
import { TestRunnerFactory } from "./core/karma/test-runner-factory";
import { KarmaServer } from "./core/karma/karma-server";
// import { CommandlineProcessHandler } from "./core/integration/commandline-process-handler";
import { PathFinder, PathFinderOptions } from './core/helpers/path-finder';
import { ConfigSetting } from "./model/enums/config-setting"

export class Adapter implements TestAdapter {

  private logger: Logger;
  private config: TestExplorerConfiguration = {} as TestExplorerConfiguration;
  private disposables: Array<{ dispose(): void }> = [];
  private readonly retireEmitter = new vscode.EventEmitter<RetireEvent>();
  private readonly testLoadEmitter = new vscode.EventEmitter<TestLoadStartedEvent | TestLoadFinishedEvent>();
  private readonly testRunEmitter = new vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>();
  private readonly autorunEmitter = new vscode.EventEmitter<void>();
  private readonly testExplorer: KarmaTestExplorer;
  private pathFinder?: PathFinder;
  private readonly debugger: Debugger;
  private isTestProcessRunning: boolean = false;
  // private loadedTests: TestSuiteInfo = {} as TestSuiteInfo;
  private loadedTestsById: { [key: string]: TestInfo | TestSuiteInfo } = {};

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
    this.logger = new Logger(log);
    this.logger.info("Initializing adapter");

    this.disposables.push(this.testLoadEmitter);
    this.disposables.push(this.testRunEmitter);
    this.disposables.push(this.autorunEmitter);
    this.disposables.push(vscode.workspace.onDidSaveTextDocument(this.handleDocumentSaved));
    this.disposables.push(vscode.workspace.onDidChangeConfiguration(this.handleConfigurationChange));

    this.loadConfig(configPrefix);

    const testRunEventEmitter = new TestRunEventEmitter(this.testRunEmitter);
    const karmaEventListener = new KarmaEventListener(testRunEventEmitter, this.logger);
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
  }

  public async load(): Promise<void> {
    if (this.isTestProcessRunning) {
      this.logger.debug(`New test load request ignored - Another test operation is still running`);
      return;
    }
    this.logger.debug(`Test load started`);
    return this.refresh(true);
  }

  private async reload(): Promise<void> {
    this.logger.debug(`Test reload started`);

    if (this.isTestProcessRunning) {
      this.logger.debug(`Test reload - Aborting previously running test operation`);
      await this.cancel();
    }
    return this.load();
  }

  private async refresh(isHardRefresh: boolean = false): Promise<void> {
    if (this.isTestProcessRunning) {
      this.logger.debug(
        `Test ${isHardRefresh ? "hard " : ""}refresh request ignored - ` +
        `Another test operation is currently running`);
      return;
    }
    this.logger.debug(`Test ${isHardRefresh ? "hard " : ""}refresh started`);

    this.isTestProcessRunning = true;
    this.testLoadEmitter.fire({ type: "started" } as TestLoadStartedEvent);
    this.pathFinder = this.loadTestInfo(this.config.testFiles, this.config.excludeFiles);

    let loadedTests: TestSuiteInfo = {} as TestSuiteInfo;
    let loadError: string | undefined;
    
    try {
      if (isHardRefresh) {
        await this.testExplorer.restart(this.config);
      }
      loadedTests = await this.testExplorer.loadTests(this.pathFinder);
    } catch (error) {
      loadError = `Failed to load tests - ${error?.message ?? error}`;;
    }

    const testLoadFinishedEvent: TestLoadFinishedEvent = { type: "finished" };

    if (loadError) {
      testLoadFinishedEvent.errorMessage = loadError;
    } else if (loadedTests?.children?.length > 0) {
      testLoadFinishedEvent.suite = loadedTests;
    }

    this.storeLoadedTests(loadedTests);
    this.testLoadEmitter.fire(testLoadFinishedEvent);
    this.retireEmitter.fire({} as RetireEvent);

    this.isTestProcessRunning = false;
    this.logger.debug(`Test loading finished`);
  }

  public async run(testIds: string[]): Promise<void> {
    if (this.isTestProcessRunning) {
      this.logger.debug(`New test run request ignored - Another test operation is still running`);
      return;
    }
    this.isTestProcessRunning = true;
    this.logger.debug(`Test run started`);
    this.logger.info(`Test run is for test ids: ${JSON.stringify(testIds)}`);

    this.testRunEmitter.fire({ type: "started", tests: testIds } as TestRunStartedEvent);

    const tests: Array<TestInfo | TestSuiteInfo> = testIds.map(testId => this.loadedTestsById[testId]);
    await this.testExplorer.runTests(tests);

    this.testRunEmitter.fire({ type: "finished" } as TestRunFinishedEvent);
    this.isTestProcessRunning = false;
    this.logger.debug(`Test run finished`);
  }

  public async debug(tests: string[]): Promise<void> {
    await this.debugger.manageVSCodeDebuggingSession(this.workspace, this.config.debuggerConfig);
    await this.run(tests);
  }

  public async cancel(): Promise<void> {
    this.logger.debug(`Aborting any currently running test operation`);
    await this.testExplorer.stopCurrentRun();
    this.isTestProcessRunning = false;
  }

  public async dispose(): Promise<void> {
    this.testExplorer.dispose();

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }

  private storeLoadedTests(rootSuite: TestSuiteInfo) {
    const testsById: { [key: string]: TestInfo | TestSuiteInfo } = {};

    const processTestTree = (test: TestInfo | TestSuiteInfo): void => {
      testsById[test.id] = test;
      if (test.type === TestType.Suite && test?.children?.length > 0) {
        test.children.forEach((childTest => processTestTree(childTest)));
      }
    };
    processTestTree(rootSuite);
    // this.loadedTests = rootSuite;
    this.loadedTestsById = testsById;
  }

  private loadConfig(configPrefix: string) {
    const config = vscode.workspace.getConfiguration(configPrefix, this.workspace.uri);
    this.config = new TestExplorerConfiguration(config, this.workspace.uri.path);
  }

  private loadTestInfo(testFiles: string[], excludeFiles?: string[]): PathFinder {
    this.logger.info(`Loading test info from test files`);

    const pathFinderOptions = {
      ignore: excludeFiles,
      cwd: this.config.projectRootPath
    } as PathFinderOptions;
    return new PathFinder(testFiles, pathFinderOptions);
  }

  private handleConfigurationChange = (configChangeEvent: vscode.ConfigurationChangeEvent) => {
    this.logger.info("Configuration changed");

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
    this.reload();
  }

  private handleDocumentSaved = (document:vscode.TextDocument) => {
    const isConfigLoadCompleted = !!this.config;
    const savedFilePath = document.uri.fsPath;
    // const isFileInWorkspace = savedFilePath.startsWith(this.workspace.uri.fsPath);

    if (!isConfigLoadCompleted) {
      return;
    }

    const reloadTriggerFiles = this.config.reloadOnKarmaConfigurationFileChange
      ? [this.config.userKarmaConfFilePath, ...this.config.reloadWatchedFiles]
      : this.config.reloadWatchedFiles;

    if (reloadTriggerFiles.includes(savedFilePath)) {
      this.logger.info(`Reloading - monitored file changed: ${savedFilePath}`);
      this.reload();
      return;
    }

    if (this.pathFinder?.isSpecFile(savedFilePath)) {
      const savedSpecFileInfo = this.pathFinder.getSpecFileInfo(savedFilePath);
      this.refresh();

      if (savedSpecFileInfo) {
        this.logger.info(`Retiring ${savedSpecFileInfo.specCount} tests from updated spec file: ${savedFilePath}`);
        this.retireEmitter.fire({ tests: [ savedSpecFileInfo.suiteName ] });
      }
      return;
    }

  }
}