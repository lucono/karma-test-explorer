import { Logger } from "./core/helpers/logger";
import {
  TestAdapter,
  TestLoadStartedEvent,
  TestLoadFinishedEvent,
  TestRunStartedEvent,
  TestRunFinishedEvent,
  TestSuiteEvent,
  TestEvent,
  TestSuiteInfo,
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

export class Adapter implements TestAdapter {
  public config: TestExplorerConfiguration = {} as TestExplorerConfiguration;
  private disposables: Array<{ dispose(): void }> = [];
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

  constructor(public readonly workspace: vscode.WorkspaceFolder, private readonly log: Log, channel: vscode.OutputChannel) {
    this.log.info("Initializing adapter");
    this.disposables.push(this.testsEmitter);
    this.disposables.push(this.testStatesEmitter);
    this.disposables.push(this.autorunEmitter);
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration(async (configChange) => {
        this.log.info("Configuration changed");

        if (
          configChange.affectsConfiguration("karmaTestExplorer.projectRootPath", this.workspace.uri) ||
          configChange.affectsConfiguration("karmaTestExplorer.karmaConfFilePath", this.workspace.uri) ||
          configChange.affectsConfiguration("karmaTestExplorer.karmaProcessExecutable", this.workspace.uri) ||
          configChange.affectsConfiguration("karmaTestExplorer.karmaPort", this.workspace.uri) ||
          configChange.affectsConfiguration("karmaTestExplorer.testFiles", this.workspace.uri) ||
          configChange.affectsConfiguration("karmaTestExplorer.excludeFiles", this.workspace.uri) ||
          configChange.affectsConfiguration("karmaTestExplorer.defaultSocketConnectionPort", this.workspace.uri) ||
          configChange.affectsConfiguration("karmaTestExplorer.debugMode", this.workspace.uri) ||
          configChange.affectsConfiguration("karmaTestExplorer.debuggerConfig", this.workspace.uri) ||
          configChange.affectsConfiguration("karmaTestExplorer.env", this.workspace.uri)
        ) {
          this.log.info("Sending reload event");
          this.load();
        }
      })
    );

    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument(async (document) => {
        if (!this.config) {
          return;
        }

        const filename = document.uri.fsPath;
        if (filename.startsWith(workspace.uri.fsPath)) {
          // this.isTestProcessRunning = true;
          // this.loadedTests = {} as TestSuiteInfo;
          // this.loadedTests = await this.testExplorer.reloadTestDefinitions();

          // this.testsEmitter.fire({ type: "started" } as TestLoadStartedEvent);
          // this.testsEmitter.fire({ type: "finished", suite: this.loadedTests } as TestLoadFinishedEvent);

          // this.isTestProcessRunning = false;

          this.log.info("Sending autorun event");
          this.autorunEmitter.fire();
        }
      })
    );

    this.loadConfig();

    const isDebugMode = vscode.workspace.getConfiguration("karmaTestExplorer", workspace.uri).get("debugMode") as boolean;
    const logger = new Logger(channel, isDebugMode);
    const karmaPort = this.config.karmaPort;

    const karmaEventEmitter = new EventEmitter(this.testStatesEmitter, this.testsEmitter);
    const karmaEventListener = new KarmaEventListener(karmaEventEmitter, logger);
    
    const karmaCommandLineProcessHandler = new CommandlineProcessHandler(karmaEventListener, logger);
    const karmaServer = new KarmaServer(karmaCommandLineProcessHandler, karmaEventListener, karmaPort, logger);
    
    const testRunnerFactory = new TestRunnerFactory(karmaEventListener, karmaPort, logger);
    const karmaRunner = testRunnerFactory.createTestRunner();
      
    this.testExplorer = new KarmaTestExplorer(karmaServer, karmaRunner, karmaEventListener, logger);
    this.debugger = new Debugger(new Logger(channel, isDebugMode));
  }

  public async load(): Promise<void> {
    if (!this.isTestProcessRunning) {
      this.isTestProcessRunning = true;
      this.loadConfig();

      this.pathFinder = this.loadTestInfo(this.config.testFiles, this.config.excludeFiles);

      this.log.info("Loading tests");

      this.testsEmitter.fire({ type: "started" } as TestLoadStartedEvent);
      this.loadedTests = await this.testExplorer.loadTests(this.config, this.pathFinder);

      this.testsEmitter.fire({ type: "finished", suite: this.loadedTests } as TestLoadFinishedEvent);
      this.isTestProcessRunning = false;
    }
  }

  public async run(tests: string[]): Promise<void> {
    if (!this.isTestProcessRunning) {
      this.isTestProcessRunning = true;
      this.log.info(`Running tests ${JSON.stringify(tests)}`);

      this.testStatesEmitter.fire({ type: "started", tests } as TestRunStartedEvent);

      const testSpec = this.findNode(this.loadedTests, tests[0], "id");
      const isComponent = testSpec.type === "suite";

      await this.testExplorer.runTests(this.config, [testSpec.fullName], isComponent);

      this.testStatesEmitter.fire({ type: "finished" } as TestRunFinishedEvent);
      this.isTestProcessRunning = false;
    }
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

  private loadConfig() {
    const config = vscode.workspace.getConfiguration("karmaTestExplorer", this.workspace.uri);
    this.config = new TestExplorerConfiguration(config, this.workspace.uri.path);
  }

  private loadTestInfo(testFiles: string[], excludeFiles?: string[]): PathFinder {
    const pathFinderOptions = {
      ignore: excludeFiles,
      cwd: this.config.projectRootPath
    } as PathFinderOptions;
    return new PathFinder(testFiles, pathFinderOptions);
  }

  private findNode(node: any, suiteLookup: string, propertyLookup: string): any {
    if (node[propertyLookup] === suiteLookup) {
      return node;
    } else {
      if (node.children !== undefined) {
        for (const child of node.children) {
          const result = this.findNode(child, suiteLookup, propertyLookup);
          if (result != null) {
            return result;
          }
        }
      }
    }
    return null;
  }
}
