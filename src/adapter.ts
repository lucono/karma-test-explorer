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
  RetireEvent
} from "vscode-test-adapter-api";
import { Log } from "vscode-test-adapter-util";
import { KarmaTestExplorer } from "./core/karma-test-explorer";
import { TestExplorerConfiguration } from "./model/test-explorer-configuration";
import * as vscode from "vscode";
import { Debugger } from "./core/test-explorer/debugger";
import { EventEmitter } from "./core/helpers/event-emitter";
import { KarmaEventListener } from "./core/integration/karma-event-listener";
import { TestRunnerFactory } from "./core/karma/test-runner-factory";
import { KarmaServer } from "./core/karma/karma-server";
import { CommandlineProcessHandler } from "./core/integration/commandline-process-handler";
import { PathFinder, PathFinderOptions } from './core/helpers/path-finder';
import { ConfigSetting } from "./model/enums/config-setting"

export class Adapter implements TestAdapter {

  private logger: Logger;
  private config: TestExplorerConfiguration = {} as TestExplorerConfiguration;
  private disposables: Array<{ dispose(): void }> = [];
  private readonly retireEmitter = new vscode.EventEmitter<RetireEvent>();
  private readonly testsEmitter = new vscode.EventEmitter<TestLoadStartedEvent | TestLoadFinishedEvent>();
  private readonly testStatesEmitter = new vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>();
  private readonly autorunEmitter = new vscode.EventEmitter<void>();
  private readonly testExplorer: KarmaTestExplorer;
  private pathFinder?: PathFinder;
  private readonly debugger: Debugger;
  private isTestProcessRunning: boolean = false;
  public loadedTests: TestSuiteInfo = {} as TestSuiteInfo;

  get tests(): vscode.Event<TestLoadStartedEvent | TestLoadFinishedEvent> {
    return this.testsEmitter.event;
  }

  get testStates(): vscode.Event<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent> {
    return this.testStatesEmitter.event;
  }

  get autorun(): vscode.Event<void> | undefined {
    return this.autorunEmitter.event;
  }

  constructor(public readonly workspace: vscode.WorkspaceFolder, private readonly configPrefix: string, log: Log) {
    this.logger = new Logger(log);
    this.logger.info("Initializing adapter");

    this.disposables.push(this.testsEmitter);
    this.disposables.push(this.testStatesEmitter);
    this.disposables.push(this.autorunEmitter);
    this.disposables.push(vscode.workspace.onDidSaveTextDocument(this.handleDocumentSaved));
    this.disposables.push(vscode.workspace.onDidChangeConfiguration(this.handleConfigurationChange));

    this.loadConfig(configPrefix);

    const karmaEventEmitter = new EventEmitter(this.testStatesEmitter, this.testsEmitter);
    const karmaEventListener = new KarmaEventListener(karmaEventEmitter, this.logger);

    const karmaCommandLineProcessHandler = new CommandlineProcessHandler(karmaEventListener, this.logger);
    const karmaServer = new KarmaServer(karmaCommandLineProcessHandler, karmaEventListener, this.logger);

    const testRunnerFactory = new TestRunnerFactory(this.config, karmaEventListener, this.logger);
    const karmaRunner = testRunnerFactory.createTestRunner();

    this.testExplorer = new KarmaTestExplorer(karmaServer, karmaRunner, karmaEventListener, this.logger);
    this.debugger = new Debugger(this.logger);
  }

  public async load(): Promise<void> {
    this.logger.debug(`Test loading started`);
    if (this.isTestProcessRunning) {
      this.logger.debug(`Test load aborted - Another test operation is currently running`);
      return;
    }
    this.isTestProcessRunning = true;
    this.testsEmitter.fire({ type: "started" } as TestLoadStartedEvent);
    this.pathFinder = this.loadTestInfo(this.config.testFiles, this.config.excludeFiles);

    const loadedTests = await this.testExplorer.loadTests(this.config, this.pathFinder);
    this.logger.info(`Test load completed ${loadedTests.children.length === 0 ? "- No tests found" : ""}`);
    this.loadedTests = loadedTests;
    this.testsEmitter.fire({ type: "finished", suite: this.loadedTests } as TestLoadFinishedEvent);
    this.retireEmitter.fire({});

    this.isTestProcessRunning = false;
    this.logger.debug(`Test loading finished`);
  }

  private async reload(): Promise<void> {
    this.logger.debug(`Test reload started`);

    if (this.isTestProcessRunning) {
      this.logger.debug(`Aborting previously running test operation`);
      await this.cancel();
    }
    this.load();
  }

  public async run(tests: string[]): Promise<void> {
    this.logger.debug(`Test run started`);
    if (this.isTestProcessRunning) {
      this.logger.debug(`Aborting test run - Another test operation is still running`);
      return;
    }
    this.isTestProcessRunning = true;
    this.logger.info(`Running tests ${JSON.stringify(tests)}`);

    this.testStatesEmitter.fire({ type: "started", tests } as TestRunStartedEvent);
    const testSpec = this.findTestNode(this.loadedTests, tests[0], "id");
    const isComponent = testSpec?.type === "suite";
    const testList = [testSpec?.fullName || ""];

    await this.testExplorer.runTests(this.config, testList, isComponent);

    this.testStatesEmitter.fire({ type: "finished" } as TestRunFinishedEvent);
    this.isTestProcessRunning = false;
    this.logger.debug(`Test run finished`);
  }

  public async debug(tests: string[]): Promise<void> {
    await this.debugger.manageVSCodeDebuggingSession(this.workspace, this.config.debuggerConfig);
    await this.run(tests);
  }

  public async cancel(): Promise<void> {
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

  private loadConfig(configPrefix: string) {
    const config = vscode.workspace.getConfiguration(configPrefix, this.workspace.uri);
    this.config = new TestExplorerConfiguration(config, this.workspace.uri.path);
  }

  private loadTestInfo(testFiles: string[], excludeFiles?: string[]): PathFinder {
    const pathFinderOptions = {
      ignore: excludeFiles,
      cwd: this.config.projectRootPath
    } as PathFinderOptions;
    return new PathFinder(testFiles, pathFinderOptions);
  }

  private findTestNode(
    testNode: TestSuiteInfo | TestInfo, 
    suiteLookup: string, 
    propertyLookup: keyof (TestSuiteInfo | TestInfo)
  ): TestSuiteInfo | TestInfo | null {

    if (testNode[propertyLookup] === suiteLookup) {
      return testNode;
    }
    
    if ((testNode as TestSuiteInfo).children !== undefined) {
      for (const child of (testNode as TestSuiteInfo).children) {
        const result = this.findTestNode(child, suiteLookup, propertyLookup);
        if (result) {
          return result;
        }
      }
    }
    return null;
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
    const isFileInWorkspace = savedFilePath.startsWith(this.workspace.uri.fsPath);

    if (!isConfigLoadCompleted || !isFileInWorkspace) {
      return;
    }

    const reloadTriggerFiles = this.config.reloadOnKarmaConfigurationFileChange
      ? [this.config.baseKarmaConfFilePath, ...this.config.reloadWatchedFiles]
      : this.config.reloadWatchedFiles;

    if (reloadTriggerFiles.includes(savedFilePath)) {
      this.reload();
    }
  }
}