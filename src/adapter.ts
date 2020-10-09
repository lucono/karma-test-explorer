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
import * as vscode from "vscode";
import { Log } from "vscode-test-adapter-util";
import { Logger } from "./core/helpers/logger";
import { KarmaTestExplorer } from "./core/karma-test-explorer";
import { TestExplorerConfiguration } from "./model/test-explorer-configuration";
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

  constructor(public readonly workspace: vscode.WorkspaceFolder, configPrefix: string, log: Log) {
    this.logger = new Logger(log);
    this.logger.info("Initializing adapter");

    this.disposables.push(this.testsEmitter);
    this.disposables.push(this.testStatesEmitter);
    this.disposables.push(this.autorunEmitter);
    this.disposables.push(vscode.workspace.onDidSaveTextDocument(this.handleDocumentSaved));
    this.disposables.push(vscode.workspace.onDidChangeConfiguration(configChangeEvent => {
      this.handleConfigurationChange(configChangeEvent, configPrefix);
    }));

    const failureHandler = (failureMsg: string) => {
      this.logger.info(`${failureMsg} - Reloading tests`);
      this.load();
    };

    this.loadConfig(configPrefix);

    const karmaEventEmitter = new EventEmitter(this.testStatesEmitter, this.testsEmitter);

    const karmaEventListener = new KarmaEventListener(
      karmaEventEmitter, 
      this.logger,
      { connectionDroppedHandler: () => failureHandler("Browser connection dropped") });

    const karmaCommandLineProcessHandler = new CommandlineProcessHandler(karmaEventListener, this.logger);

    const karmaServer = new KarmaServer(
      karmaCommandLineProcessHandler, 
      this.logger, 
      { serverCrashHandler: () => failureHandler("Karma server crashed") });

    const testRunnerFactory = new TestRunnerFactory(this.config, karmaEventListener, this.logger);
    const karmaRunner = testRunnerFactory.createTestRunner();

    this.testExplorer = new KarmaTestExplorer(karmaServer, karmaRunner, karmaEventListener, this.logger);
    this.debugger = new Debugger(this.logger);
  }

  public async load(): Promise<void> {
    this.logger.debug("Test load started");

    if (this.isTestProcessRunning) {
      this.logger.debug("Aborting test load - Another test operation is still running");
      return;
    }
    this.isTestProcessRunning = true;
    this.testsEmitter.fire({ type: "started" });
    this.pathFinder = this.loadTestInfo(this.config.testFiles, this.config.excludeFiles);

    const loadedTests = await this.testExplorer.loadTests(this.config, this.pathFinder);

    this.logger.info(
      `Test load completed ` +
      `${loadedTests.children.length === 0 ? "- No tests found" : ""}`);
    
    this.loadedTests = loadedTests;
    this.testsEmitter.fire({ type: "finished", suite: this.loadedTests } as TestLoadFinishedEvent);
    this.retireEmitter.fire({});
    
    this.isTestProcessRunning = false;
    this.logger.debug("Test load finished");
  }

  public async run(tests: string[]): Promise<void> {
    this.logger.debug("Test run started");

    if (this.isTestProcessRunning) {
      this.logger.debug("Aborting test run - Another test operation is still running");
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
    this.logger.debug("Test run finished");
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

  private async handleConfigurationChange(configChangeEvent: vscode.ConfigurationChangeEvent, configPrefix: string) {
    this.logger.info("Configuration changed");

    const hasRelevantSettingsChange =
      configChangeEvent.affectsConfiguration(`${configPrefix}.${ConfigSetting.ProjectRootPath}`, this.workspace.uri) ||
      configChangeEvent.affectsConfiguration(`${configPrefix}.${ConfigSetting.KarmaConfFilePath}`, this.workspace.uri) ||
      configChangeEvent.affectsConfiguration(`${configPrefix}.${ConfigSetting.KarmaProcessExecutable}`, this.workspace.uri) ||
      configChangeEvent.affectsConfiguration(`${configPrefix}.${ConfigSetting.KarmaPort}`, this.workspace.uri) ||
      configChangeEvent.affectsConfiguration(`${configPrefix}.${ConfigSetting.TestFiles}`, this.workspace.uri) ||
      configChangeEvent.affectsConfiguration(`${configPrefix}.${ConfigSetting.ExcludeFiles}`, this.workspace.uri) ||
      configChangeEvent.affectsConfiguration(`${configPrefix}.${ConfigSetting.DefaultSocketConnectionPort}`, this.workspace.uri) ||
      configChangeEvent.affectsConfiguration(`${configPrefix}.${ConfigSetting.DebuggerConfig}`, this.workspace.uri) ||
      configChangeEvent.affectsConfiguration(`${configPrefix}.${ConfigSetting.Env}`, this.workspace.uri);

    if (hasRelevantSettingsChange) {
      this.logger.info("Reloading tests with updated configuration");
      this.loadConfig(configPrefix);
      this.load();
    }
  }

  private async handleDocumentSaved(document:vscode.TextDocument) {
    if (!this.config) {
      return;
    }

    const filename = document.uri.fsPath;
    if (filename.startsWith(this.workspace.uri.fsPath)) {
      // this.isTestProcessRunning = true;
      // this.loadedTests = {} as TestSuiteInfo;
      // this.loadedTests = await this.testExplorer.reloadTestDefinitions();

      // this.testsEmitter.fire({ type: "started" } as TestLoadStartedEvent);
      // this.testsEmitter.fire({ type: "finished", suite: this.loadedTests } as TestLoadFinishedEvent);

      // this.isTestProcessRunning = false;

      this.logger.info("Sending autorun event");
      this.autorunEmitter.fire();
    }
  }
}
