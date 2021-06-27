import * as express from "express";
import { createServer, Server as HttpServer } from "http";
import { Server as SocketIOServer, ServerOptions, Socket } from "socket.io";
import { Disposable } from "../../../api/disposable";
import { Execution } from "../../../api/execution";
import { TestStatus } from "../../../api/test-status";
// import { TestState } from "../../../core/test-state";
import { Logger } from "../../../core/logger";
import { DeferredPromise } from "../../../util/deferred-promise";
import { KarmaAutoWatchTestEventProcessor } from "./karma-auto-watch-test-event-processor";
import { KarmaEvent } from "./karma-event";
import { KarmaEventName } from "./karma-event-name";
import { KarmaTestEventProcessor } from "./karma-test-event-processor";
import { LightSpecCompleteResponse, SpecCompleteResponse } from "./spec-complete-response";

const KARMA_CONNECT_TIMEOUT = 900_000;  // FIXME Read from config

export type TestCapture = Record<TestStatus, SpecCompleteResponse[]>;

export class KarmaTestEventListener implements Disposable {
  // private isListening: boolean = false;
  private server: HttpServer | undefined;
  private readonly sockets: Set<Socket> = new Set();

  // private currentSpecs: TestIdentification[] = [];
  // private testEventProcessor?: TestEventProcessor;
  private disposables: Disposable[] = [];

  public constructor(
    private readonly testEventProcessor: KarmaTestEventProcessor,
    private readonly watchModeTestEventProcessor: KarmaAutoWatchTestEventProcessor | undefined,
    private readonly logger: Logger)
  {
    this.disposables.push(logger);
  }

  public receiveKarmaConnection(socketPort: number): Execution {
    const connectionClosedDeferred: DeferredPromise = new DeferredPromise();

    const connectionEstablishedPromise = new Promise<void>(async (resolve, reject) => {
      if (this.isRunning()) {
        this.logger.info(
          `Request to open new karma listener connection on port ${socketPort} - ` +
          `Stopping currently running listener`);
        
        await this.stop();
      }
      this.logger.info(`Attempting to listen on port ${socketPort}`);
  
      const app = express();
      const server = createServer(app);
      this.server = server;
  
      const socketServerOptions = {
        pingInterval: 24 * 60 * 60 * 1000,
        pingTimeout: 24 * 60 * 60 * 1000
      } as ServerOptions;
  
      const io = new SocketIOServer(server, socketServerOptions);

      this.logger.info(`Waiting on port ${socketPort} for Karma to connect...`);
      let connectTimeoutId: ReturnType<typeof setTimeout>;

      io.on("connection", (socket) => {
        this.logger.info(`Karma Event Listener: New socket connection from Karma on port ${socketPort}`);
        this.sockets.add(socket);

        socket.on(KarmaEventName.BrowserConnected, (event: KarmaEvent) => {
          this.logger.debug(() => `Received Karma event: ${JSON.stringify(event, null, 2)}`);

          if (connectTimeoutId !== undefined) {
            clearTimeout(connectTimeoutId);
          }
          resolve();
        });

        socket.on(KarmaEventName.RunStart, (event: KarmaEvent) => {
          this.logger.debug(() => `Received Karma event: ${JSON.stringify(event, null, 2)}`);
        });

        socket.on(KarmaEventName.BrowserStart, (event: KarmaEvent) => {
          this.logger.debug(() => `Received Karma event: ${JSON.stringify(event, null, 2)}`);
          
          if (!this.testEventProcessor.isProcessing()) {
            this.watchModeTestEventProcessor?.beginProcessing();
          }
        });

        socket.on(KarmaEventName.BrowserError, (event: KarmaEvent) => {
          this.logger.debug(() => `Received Karma event: ${JSON.stringify(event, null, 2)}`);
        });

        socket.on(KarmaEventName.SpecComplete, (event: KarmaEvent) => {
          this.logger.debug(() => `Received Karma event: ${JSON.stringify(event, null, 2)}`);

          const eventProcessor = this.testEventProcessor.isProcessing() ? this.testEventProcessor
            : this.watchModeTestEventProcessor?.isProcessing() ? this.watchModeTestEventProcessor
            : undefined;
            
          this.onSpecComplete(event, eventProcessor);
        });

        socket.on(KarmaEventName.BrowserComplete, (event: KarmaEvent) => {
          this.logger.debug(() => `Received Karma event: ${JSON.stringify(event, null, 2)}`);
          
          if (this.watchModeTestEventProcessor?.isProcessing()) {
            this.watchModeTestEventProcessor?.concludeProcessing();
          }
        });

        socket.on(KarmaEventName.RunComplete, (event: KarmaEvent) => {
          this.logger.debug(() => `Received Karma event: ${JSON.stringify(event, null, 2)}`);
          
          // if (this.watchModeTestEventProcessor?.isProcessing()) {
          //   this.watchModeTestEventProcessor?.concludeProcessing();
          // }
        });

        socket.on("disconnect", (reason: string) => {
          this.logger.info(`Karma Event Listener: Karma disconnected from socket with reason: ${reason}`);
          socket.removeAllListeners();
          this.sockets.delete(socket);
        });
      });

      server!.listen(socketPort, () => {
        this.logger.info(`Karma Event Listener: Listening to KarmaReporter events on port ${socketPort}`);
      });

      server!.on("close", () => {
        this.logger.info(`Karma Event Listener: Connection closed on ${socketPort}`);
        clearTimeout(connectTimeoutId);
        this.server = undefined;
        connectionClosedDeferred.resolve();
      });

      connectTimeoutId = setTimeout(() => {
        this.logger.error(`Timeout after waiting ${KARMA_CONNECT_TIMEOUT} ms for Karma to connect on port ${socketPort}`);
        reject(`Timeout after waiting ${KARMA_CONNECT_TIMEOUT} ms for Karma to connect`);
      }, KARMA_CONNECT_TIMEOUT);
    });

    const karmaConnection: Execution = {
      started: () => connectionEstablishedPromise,
      ended: () => connectionClosedDeferred.promise()
    };

    return karmaConnection;
  }

  public async listenForTestLoad(testLoadExecution: Execution): Promise<SpecCompleteResponse[]> {
    return this.listenForTests(testLoadExecution, false);
  }

  public async listenForTestRun(testRunExecution: Execution, testNames?: string[]): Promise<TestCapture> {
    const capturedSpecs = await this.listenForTests(testRunExecution, true, testNames);

    const capturedTests: TestCapture = {
      [TestStatus.Failed]: [],
      [TestStatus.Success]: [],
      [TestStatus.Skipped]: []
    };

    capturedSpecs.forEach(processedSpec => capturedTests[processedSpec.status].push(processedSpec));

    return capturedTests;
  }

  private async listenForTests(
    testExecution: Execution,
    emitEvents: boolean,
    // testEventProcessor: TestEventProcessor,
    testNames: string[] = []): Promise<SpecCompleteResponse[]>
  {
    try {
      // this.currentSpecs = tests;
      // this.isListening = true;
      // this.testEventProcessor = testEventProcessor;

      this.watchModeTestEventProcessor?.abortProcessing();
      
      this.testEventProcessor.beginProcessing(testNames);
      await testExecution.ended();
      this.testEventProcessor.concludeProcessing();

      // const capturedTests: TestCapture = {
      //   [TestStatus.Failed]: [],
      //   [TestStatus.Success]: [],
      //   [TestStatus.Skipped]: []
      // };

      // this.testEventProcessor.getProcessedEvents().forEach(
      //   processedSpec => capturedTests[processedSpec.status].push(processedSpec)
      // );

      return this.testEventProcessor.getProcessedSpecs();

    } catch (error) {
      this.logger.error(`Could not listen for Karma events - Test execution failed: ${error.message ?? error}`);
      throw new Error(error.message ?? error);

    }
    // finally {
    //   this.testEventProcessor = undefined;
    //   // this.isListening = false;
    //   // this.currentSpecs = [];
    // }
  }

  // private isIncludedSpec(specResult: SpecCompleteResponse): boolean {
  //   const acceptAllSpecs = this.currentSpecs.length === 0;

  //   return acceptAllSpecs || this.currentSpecs.some(includedSpecName => {
  //     return specResult.fullName === includedSpecName || specResult.fullName.startsWith(includedSpecName);
  //   });
  // }

  private onSpecComplete(
    event: KarmaEvent,
    testEventProcessor?: KarmaTestEventProcessor | KarmaAutoWatchTestEventProcessor)
  {
    if (!testEventProcessor?.isProcessing()) {
      return;
    }
    const results: LightSpecCompleteResponse = event.results;
    const fullName: string = [ ...results.suite, results.description ].join(" ");
    const testId: string = results.id || `${results.filePath ?? ''}:${fullName}`;
    const specResults: SpecCompleteResponse = { ...results, id: testId, fullName };
    // const isIncludedSpec = this.isIncludedSpec(specResults);

    // if (!isIncludedSpec) {
    //   this.logger.debug(() =>
    //     `Karma Event Listener: Skipping spec id '${specResults.id}' - ` +
    //     `Not part of current test run`);

    //   return;
    // }
    // const testStatus: TestStatus = specResults.status;

    // if (!Object.values(TestStatus).includes(testStatus)) {
    //   this.logger.warn(`Skipping captured spec with unknown result value: ${testStatus}`);
    //   this.logger.debug(() => `Skipped captured spec with unknown result '${testStatus}': ${specResults}`);
    //   return;
    // }

    testEventProcessor.processTestResultEvent(specResults);
    this.logger.status(specResults.status);
  }

  public async stop(): Promise<void> {
    if (!this.isRunning()) {
      this.logger.info(`Request to stop karma listener - Listener not currently up`);
      return;
    }
    const server = this.server!;

    this.logger.info(`Karma Event Listener: Closing connection with karma`);

    return new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          this.logger.error(`Failed closing karma listener connection: ${error.message}`);
          reject();
          return;
        }
        this.logger.info(`Done closing karma listener connection`);
        resolve();
      });
      this.cleanupConnections();
    });
  }

  private cleanupConnections() {
    this.logger.info(`Karma Event Listener: Cleaning up connections`);
    try {
      this.sockets.forEach(socket => {
        socket.removeAllListeners();
        socket.disconnect(true);
      });
      
      this.sockets.clear();

    } catch (error) {
      this.logger.error(`Failure closing connection with karma: ${error}`);
    }
  }

  public isRunning(): boolean {
    return this.server !== undefined;
  }
  
  public dispose(): void {
    this.disposables.forEach(disposable => disposable.dispose());
  }
}
