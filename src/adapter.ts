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
import { Logger } from "./util/logger";
import { Log } from "vscode-test-adapter-util";
import { ExtensionConfig } from "./core/extension-config";
import { Debugger } from "./core/debugger";
import { SpecLocation, SpecLocator } from './util/spec-locator';
import { ConfigSetting } from "./core/config-setting"
import { Event, EventEmitter, workspace, ConfigurationChangeEvent, TextDocument, WorkspaceFolder } from "vscode";
import { TestType } from "./api/test-infos";
import { TestLoadEvent, TestRunEvent } from "./api/test-events";
import { TestManager } from "./api/test-manager";
import { Disposable } from "./api/disposable";
import { TestExplorerFactory } from "./core/test-explorer-factory";
import { TestResolver } from "./frameworks/karma/integration/test-resolver";
import { SpecLocationResolver } from "./frameworks/karma/integration/spec-response-to-test-suite-info-mapper";

export class Adapter implements TestAdapter {

  private specLocator?: SpecLocator;
  private isTestProcessRunning: boolean = false;
  private loadedRootSuite?: TestSuiteInfo;
  private loadedTestsById: Map<string, TestInfo | TestSuiteInfo> = new Map();
  private disposables: Disposable[] = [];

  private readonly retireEmitter = new EventEmitter<RetireEvent>();
  private readonly testLoadEmitter = new EventEmitter<TestLoadEvent>();
  private readonly testRunEmitter = new EventEmitter<TestRunEvent>();
  private readonly autorunEmitter = new EventEmitter<void>();

  private factory!: TestExplorerFactory;
  private config!: ExtensionConfig;
  private debugger!: Debugger;
  private logger!: Logger;
  private testManager!: TestManager;

  // private configFactory: ExtensionConfigFactory;
  // private testManagerFactory: TestManagerFactory;

  public async dispose(): Promise<void> {
    // this.testManager.dispose();
    this.disposables.forEach(disposable => disposable?.dispose());
    this.disposables = [];
  }

  private preInitFinalize() {
    this.factory.dispose();
    this.logger.dispose();
    this.debugger.dispose();
    this.config.dispose();
    this.specLocator?.dispose();
    this.testManager.dispose();
  }

  private init() {
    this.factory = new TestExplorerFactory(this.workspaceFolder, this.configPrefix, this.log);
    this.config = this.factory.getExtensionConfig();
    this.logger = new Logger(this.log, 'Adapter', this.config.debugLevelLoggingEnabled);

    this.logger.info(`Initializing adapter`);

    this.specLocator = this.factory.fetchTestInfo();
    this.debugger = new Debugger(this.logger);

    const specLocationResolver: SpecLocationResolver = (suite: string[], description?: string): SpecLocation[] => {
      return this.specLocator?.getSpecLocation(suite, description) ?? [];
    };

    const testResolver: TestResolver = {
      resolveTest: (testId: string): TestInfo | undefined => {
        const test = this.loadedTestsById.get(testId);
        return test?.type === TestType.Test ? test : undefined;
      },

      resolveTestSuite: (testSuiteId: string): TestSuiteInfo | undefined => {
        const testSuite = this.loadedTestsById.get(testSuiteId);
        return testSuite?.type === TestType.Suite ? testSuite : undefined;
      }
    };

    this.testManager = this.factory.createTestManager(
      this.testRunEmitter,
      specLocationResolver,
      testResolver,
      2);  // FIXME: Get shard count from config
  }

  constructor(
    public readonly workspaceFolder: WorkspaceFolder,
    private readonly configPrefix: string,
    private readonly log: Log)
  {
    this.disposables.push(
      this.testLoadEmitter,
      this.testRunEmitter,
      this.autorunEmitter,
      workspace.onDidSaveTextDocument(this.handleDocumentSaved, this),
      workspace.onDidChangeConfiguration(this.handleConfigurationChange, this));

    this.init();
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
    this.specLocator = this.factory.fetchTestInfo();

    let loadedTests: TestSuiteInfo | undefined;
    let loadError: string | undefined;
    
    try {
      if (isHardRefresh) {
        await this.testManager.restart();
      }
      loadedTests = await this.testManager.loadTests();
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
      await this.testManager.runTests(runAllTests ? [] : tests);
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
    await this.debugger?.manageVSCodeDebuggingSession(this.workspaceFolder, this.config.debuggerConfig);
    await this.run(tests);
  }

  public async cancel(): Promise<void> {
    this.logger.debug(() => `Aborting any currently running test operation`);
    await this.testManager.stopCurrentRun();
    this.isTestProcessRunning = false;
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

    // this.logger.info(`Loaded ${this.loadedTestsById.size} total tests`);
  }

  // private loadConfig(configPrefix: string) {
  //   const config = workspace.getConfiguration(configPrefix, this.workspaceFolder.uri);
  //   const configLogger = new Logger(this.log, 'ExtensionConfig', true);
  //   this.config = new ExtensionConfig(config, this.workspaceFolder.uri.path, configLogger);
  // }

  // private loadTestInfo(testFiles: string[], excludeFiles?: string[]): SpecLocator {
  //   this.logger.info(`Loading test info from test files`);

  //   const specLocatorOptions: SpecLocatorOptions = {
  //     ignore: excludeFiles,
  //     cwd: this.config.projectRootPath
  //   };
  //   return new SpecLocator(testFiles, this.logger, specLocatorOptions);
  // }

  private async reset() {
    this.preInitFinalize();
    this.init();
    await this.reload();
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

    await this.reset();
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
      this.logger.info(`Resetting - monitored file changed: ${savedFile}`);
      await this.reset();

    } else if (this.specLocator?.isSpecFile(savedFile)) {
      this.logger.info(`Refreshing - spec file changed: ${savedFile}`);
      // const savedSpecFileInfo = this.specLocator.getSpecFileInfo(savedFile);
      await this.refresh();

      // if (savedSpecFileInfo) {
      //   this.logger.info(`Retiring ${savedSpecFileInfo.specCount} tests from updated spec file: ${savedFile}`);
      //   this.retireEmitter.fire({ tests: [ savedSpecFileInfo.suiteName ] });
      // }
    }
  }

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
}