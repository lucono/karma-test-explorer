import { TestRunner } from "../api/test-runner";
import { KarmaEventListener } from "../frameworks/karma/runner/karma-event-listener";
import { Logger } from "./logger";
import { TestInfo, TestSuiteInfo } from "vscode-test-adapter-api";
import { Execution } from "../api/execution";
import { TestType } from "../api/test-infos";
import { TestManager } from "../api/test-manager";
import { TestServer } from "../api/test-server";
import { PortAcquisitionManager } from "../util/port-acquisition-manager";
import { DeferredPromise } from "../util/deferred-promise";
import { TestResults } from "../api/test-results";

export class DefaultTestManager implements TestManager {
  private disposables: { dispose: () => void }[] = [];
  private testRunning: boolean = false;

  public constructor(
    private readonly testServer: TestServer,
    private readonly testRunner: TestRunner,
    private readonly karmaEventListener: KarmaEventListener,
    private readonly portManager: PortAcquisitionManager,
    private readonly defaultKarmaPort: number,
    private readonly defaultKarmaSocketConnectionPort: number,
    private readonly logger: Logger
  ) {
    // DisposablesHelper.from(karmaServer, testRunner, karmaEventListener, logger);

    this.disposables.push(testServer);
    this.disposables.push(testRunner);
    this.disposables.push(karmaEventListener);
    this.disposables.push(logger);
  }

  public async restart(): Promise<void> {
    try {
      await this.stopCurrentRun();

      const deferredKarmaPortRelease: DeferredPromise = new DeferredPromise();
      const deferredListenerSocketPortRelease: DeferredPromise = new DeferredPromise();

      const serverKarmaPort = await this.portManager.findAvailablePort(
        this.defaultKarmaPort, 
        deferredKarmaPortRelease.promise()
      );  // FIXME: Decide on consistent style

      const karmerListenerSocketPort = await this.portManager.findAvailablePort(
        this.defaultKarmaSocketConnectionPort, 
        deferredListenerSocketPortRelease.promise()
      );  // FIXME: Decide on consistent style

      this.logger.info(
        `Using available karma port: ` +
        `${this.defaultKarmaPort} --> ${serverKarmaPort}`);

      this.logger.info(
        `Using available karma listener socket port: ` +
        `${this.defaultKarmaSocketConnectionPort} --> ${karmerListenerSocketPort}`);

      const karmaServerExecution: Execution = this.testServer.start(
        serverKarmaPort,
        karmerListenerSocketPort);

      await karmaServerExecution.started();

      await new Promise<void>((resolve, reject) => {
        const karmaServerConnection: Execution = this.karmaEventListener.receiveKarmaConnection(
          karmerListenerSocketPort
        );
  
        karmaServerConnection.started()
          .then(() => resolve())
          .catch(failureReason => reject(`${failureReason}`));
        
        karmaServerConnection.ended().then(() => {
          deferredListenerSocketPortRelease.resolve();
        });

        karmaServerExecution.ended().then(() => {
          deferredKarmaPortRelease.resolve();
          reject(`Karma server quit unexpectedly`);
        });
      });
    } catch (error) {
      this.logger.error(`Failed to load tests: ${error}`);
      await this.stopCurrentRun();
      throw error;
    }
  }

  public async loadTests(): Promise<TestSuiteInfo> {
    try {
      if (!this.isSystemsRunning()) {
        this.logger.info(
          `Request to load tests - ` +
          `karma server is ${!this.testServer.isRunning() ? 'not' : ''} running, and ` +
          `karma listener is ${!this.karmaEventListener.isRunning() ? 'not' : ''} running - ` +
          `Restarting both`);

        await this.restart();
      }
      
      this.logger.info("Proceeding to load tests");

      const karmaPort = this.testServer.getServerPort()!;
      const testSuiteInfo: TestSuiteInfo = await this.testRunner.loadTests(karmaPort);

      return testSuiteInfo;
      
    } catch (error) {
      const failureMessage = `Test loading failed: ${error.message ?? error}`;
      this.logger.error(failureMessage);
      throw new Error(failureMessage);
    }
  }

  public async runTests(tests: (TestInfo | TestSuiteInfo)[]): Promise<TestResults> {
    try {
      if (!this.isSystemsRunning()) {
        this.logger.info(`Request to run tests - ` +
          `karma server is ${!this.testServer.isRunning() ? 'not' : ''} running, and ` +
          `karma listener is ${!this.karmaEventListener.isRunning() ? 'not' : ''} running - ` +
          `Restarting both`);

        await this.restart();
      }
      
      this.logger.info("Proceeding to run tests");

      this.testRunning = true;
      const karmaPort: number = this.testServer.getServerPort()!;
      const uniqueTests = this.removeTestOverlaps(tests);
      const testResults: TestResults = await this.testRunner.runTests(karmaPort, uniqueTests);

      return testResults;

    } finally {
      this.testRunning = false;
    }
  }

  public async stopCurrentRun(): Promise<void> {
    if (this.karmaEventListener.isRunning()) {
      await this.karmaEventListener.stop();
    }

    if (this.testServer.isRunning()) {
      // FIXME: Should this use stop() instead of kill()?
      // Which one best guarantees termination of both karma
      // and its launched browser/s without leaving any orphans?
      await this.testServer.stop();
    }
  }

  private removeTestOverlaps(tests: (TestInfo | TestSuiteInfo)[]): (TestInfo | TestSuiteInfo)[] {
    const resolvedTests = new Set(tests);

    const removeDuplicates = (test: TestInfo | TestSuiteInfo) => {
      if (resolvedTests.has(test)) {
        resolvedTests.delete(test);
      }
      if (test.type === TestType.Suite) {
        test.children.forEach(childTest => removeDuplicates(childTest));
      }
    }

    tests.forEach(test => {
      if (resolvedTests.has(test) && test.type === TestType.Suite) {
        test.children.forEach(childTest => removeDuplicates(childTest))
      };
    });

    return [ ...resolvedTests ];
  }

  public isTestRunning(): boolean {
    return this.testRunning;
  }

  private isSystemsRunning(): boolean {  // FIXME: Find better method name
    return this.testServer.isRunning() && this.karmaEventListener.isRunning();
  }

  public dispose(): void {
    this.stopCurrentRun();
    this.disposables.forEach(disposable => disposable.dispose());
  }
}
