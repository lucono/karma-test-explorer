import * as express from 'express';
import { createServer, Server as HttpServer } from 'http';
import { Server as SocketIOServer, ServerOptions, Socket } from 'socket.io';
import { Disposable } from '../../../api/disposable';
import { Execution } from '../../../api/execution';
import { TestStatus } from '../../../api/test-status';
import { Logger } from '../../../core/logger';
import { DeferredPromise } from '../../../util/deferred-promise';
import { KarmaAutoWatchTestEventProcessor } from './karma-auto-watch-test-event-processor';
import { KarmaEvent } from './karma-event';
import { KarmaEventName } from './karma-event-name';
import { KarmaTestEventProcessor, TestEventProcessingOptions } from './karma-test-event-processor';
import { LightSpecCompleteResponse, SpecCompleteResponse } from './spec-complete-response';

const KARMA_CONNECT_TIMEOUT = 900_000; // FIXME Read from config

export type TestCapture = Record<TestStatus, SpecCompleteResponse[]>;

export class KarmaTestEventListener implements Disposable {
	private server: HttpServer | undefined;
	private readonly sockets: Set<Socket> = new Set();
	private disposables: Disposable[] = [];

	public constructor(
		private readonly testEventProcessor: KarmaTestEventProcessor,
		private readonly watchModeTestEventProcessor: KarmaAutoWatchTestEventProcessor | undefined,
		private readonly logger: Logger
	) {
		this.disposables.push(logger);
	}

	public receiveKarmaConnection(socketPort: number): Execution {
		const connectionClosedDeferred: DeferredPromise = new DeferredPromise();

		const connectionEstablishedPromise = new Promise<void>(async (resolve, reject) => {
			if (this.isRunning()) {
				this.logger.info(
					`Request to open new karma listener connection on port ${socketPort} - ` +
						`Stopping currently running listener`
				);

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

			io.on('connection', socket => {
				this.logger.info(`Karma Event Listener: New socket connection from Karma on port ${socketPort}`);
				this.sockets.add(socket);

				socket.on(KarmaEventName.BrowsersReady, (event: KarmaEvent) => {
					this.logger.debug(() => `Received Karma event: ${JSON.stringify(event, null, 2)}`);

					if (connectTimeoutId !== undefined) {
						clearTimeout(connectTimeoutId);
					}
					this.logger.info(`All browsers connected and ready for test execution`);
					resolve();
				});

				socket.on(KarmaEventName.RunStart, (event: KarmaEvent) => {
					this.logger.debug(() => `Received Karma event: ${JSON.stringify(event, null, 2)}`);

					if (!this.testEventProcessor.isProcessing()) {
						this.watchModeTestEventProcessor?.beginProcessing();
					}
				});

				socket.on(KarmaEventName.BrowserStart, (event: KarmaEvent) => {
					this.logger.debug(() => `Received Karma event: ${JSON.stringify(event, null, 2)}`);
				});

				socket.on(KarmaEventName.SpecComplete, (event: KarmaEvent) => {
					this.logger.debug(() => `Received Karma event: ${JSON.stringify(event, null, 2)}`);

					const eventProcessor = this.testEventProcessor.isProcessing()
						? this.testEventProcessor
						: this.watchModeTestEventProcessor?.isProcessing()
						? this.watchModeTestEventProcessor
						: undefined;

					this.onSpecComplete(event, eventProcessor);
				});

				socket.on(KarmaEventName.BrowserComplete, (event: KarmaEvent) => {
					this.logger.debug(() => `Received Karma event: ${JSON.stringify(event, null, 2)}`);
				});

				socket.on(KarmaEventName.RunComplete, (event: KarmaEvent) => {
					this.logger.debug(() => `Received Karma event: ${JSON.stringify(event, null, 2)}`);

					if (this.watchModeTestEventProcessor?.isProcessing()) {
						this.watchModeTestEventProcessor?.concludeProcessing();
					}
				});

				socket.on(KarmaEventName.BrowserError, (event: KarmaEvent) => {
					this.logger.debug(() => `Received Karma event: ${JSON.stringify(event, null, 2)}`);
					this.logger.error(`Browser error while listening for test events: ${JSON.stringify(event)}`);
				});

				socket.on('disconnect', (reason: string) => {
					this.logger.info(`Karma Event Listener: Karma disconnected from socket with reason: ${reason}`);
					socket.removeAllListeners();
					this.sockets.delete(socket);
				});
			});

			server!.listen(socketPort, () => {
				this.logger.info(`Karma Event Listener: Listening to KarmaReporter events on port ${socketPort}`);
			});

			server!.on('close', () => {
				this.logger.info(`Karma Event Listener: Connection closed on ${socketPort}`);
				clearTimeout(connectTimeoutId);
				this.server = undefined;
				connectionClosedDeferred.resolve();
			});

			connectTimeoutId = setTimeout(() => {
				this.logger.error(
					`Timeout after waiting ${KARMA_CONNECT_TIMEOUT} ms for Karma to connect on port ${socketPort}`
				);
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
		return this.listenForTests(testLoadExecution, [], {
			emitTestEvents: [],
			filterTestEvents: [],
			emitTestStats: false
		});
	}

	public async listenForTestRun(testRunExecution: Execution, testNames: string[] = []): Promise<TestCapture> {
		const capturedSpecs = await this.listenForTests(testRunExecution, testNames, {
			emitTestEvents: Object.values(TestStatus),
			filterTestEvents: [],
			emitTestStats: true
		});

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
		testNames: string[],
		eventProcessingOptions: TestEventProcessingOptions
	): Promise<SpecCompleteResponse[]> {
		try {
			this.watchModeTestEventProcessor?.abortProcessing();

			this.testEventProcessor.beginProcessing(testNames, eventProcessingOptions);
			await testExecution.ended();
			this.testEventProcessor.concludeProcessing();

			return this.testEventProcessor.getProcessedSpecs();
		} catch (error) {
			this.logger.error(`Could not listen for Karma events - Test execution failed: ${error.message ?? error}`);
			throw new Error(error.message ?? error);
		}
	}

	private onSpecComplete(
		event: KarmaEvent,
		testEventProcessor?: KarmaTestEventProcessor | KarmaAutoWatchTestEventProcessor
	) {
		if (!testEventProcessor?.isProcessing()) {
			return;
		}
		const results: LightSpecCompleteResponse = event.results;
		const fullName: string = [...results.suite, results.description].join(' ');
		const testId: string = results.id || `${results.filePath ?? ''}:${fullName}`;
		const specResults: SpecCompleteResponse = { ...results, id: testId, fullName };
		const testStatus: TestStatus = specResults.status;

		testEventProcessor.processTestResultEvent(specResults);

		const statusMsg =
			testStatus === TestStatus.Success
				? `[SUCCESS] ✅ Passed`
				: testStatus === TestStatus.Failed
				? `[FAILURE] ❌ failed`
				: `[SKIPPED] Test Skipped`;

		this.logger.info(statusMsg);
	}

	public async stop(): Promise<void> {
		if (!this.isRunning()) {
			this.logger.info(`Request to stop karma listener - Listener not currently up`);
			return;
		}
		const server = this.server!;

		this.logger.info(`Karma Event Listener: Closing connection with karma`);

		return new Promise<void>((resolve, reject) => {
			server.close(error => {
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
