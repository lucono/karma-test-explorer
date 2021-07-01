import { Server as SocketIOServer } from 'socket.io';
import { ConfigOptions as KarmaConfigOptions, TestResults as KarmaTestResults } from 'karma';
import { EventEmitter } from 'events';
import { KarmaEventName } from '../karma/runner/karma-event-name';
import { Worker } from 'worker_threads';
import { TestStatus } from '../../api/test-status';
import { LightSpecCompleteResponse } from '../karma/runner/spec-complete-response';
import { TestRunStatus } from './test-run-status';
import { resolve } from 'path';
import { TestResultEmitterWorkerData } from '../karma/runner/test-result-emitter-worker-data';
import { KarmaEnvironmentVariable } from '../karma/karma-environment-variable';
import { BrowserInfo, KarmaEvent } from '../karma/runner/karma-event';
import { DebugAwareLog } from '../../util/debug-aware-log';
import { Log } from '../../core/log';

const pingTimeout = 24 * 60 * 60 * 1000;
const pingInterval = 24 * 60 * 60 * 1000;

function TestExplorerJasmineReporter(
	this: any,
	baseReporterDecorator: any,
	config: KarmaConfigOptions,
	logger: any,
	emitter: EventEmitter,
	injector: any
) {
	const self = this;

	const debugLoggingEnabled =
		(process.env[KarmaEnvironmentVariable.DebugLoggingEnabled] ?? 'false').toLocaleLowerCase() === 'true';
	const karmaLog: Log = logger.create(`reporter:${name}`);
	const log = new DebugAwareLog(karmaLog, debugLoggingEnabled);

	baseReporterDecorator(self);
	self.config = config;
	self.emitter = emitter;

	const socketPort = Number.parseInt(process.env[KarmaEnvironmentVariable.KarmaSocketPort]!, 10);

	const workerData: TestResultEmitterWorkerData = {
		socketPort,
		pingTimeout,
		pingInterval
	};

	const workerScriptFile = resolve(__dirname, '..', 'karma', 'runner', 'test-result-emitter-worker.js');
	const worker = new Worker(workerScriptFile, { workerData });

	log.info(`Using socket port from '${KarmaEnvironmentVariable.KarmaSocketPort}' env variable: ${socketPort}`);
	log.debug(() => `Using ping timeout of '${pingTimeout}' and ping interval of '${pingInterval}'`);

	configureTimeouts(injector);

	const toBrowser = (browser: any): BrowserInfo | undefined =>
		!browser
			? undefined
			: {
					id: browser.id,
					name: browser.name,
					fullName: browser.fullName
			  };

	const sendEvent = (event: KarmaEvent) => {
		worker.postMessage({ ...event });
	};

	self.emitter.on(KarmaEventName.RunStart, (browsers: any) =>
		sendEvent({
			name: KarmaEventName.RunStart,
			browsers: browsers.map(toBrowser)
		})
	);

	self.emitter.on(KarmaEventName.BrowserStart, (browser: any, info: any) =>
		sendEvent({
			name: KarmaEventName.BrowserStart,
			browser: toBrowser(browser),
			info
		})
	);

	self.emitter.on(KarmaEventName.SpecComplete, (browser: any, spec: Record<string, any>) => {
		const status: TestStatus = spec.skipped
			? TestStatus.Skipped
			: spec.success
			? TestStatus.Success
			: TestStatus.Failed;

		const specResult: LightSpecCompleteResponse = {
			id: spec.id,
			failureMessages: spec.log,
			suite: spec.suite,
			description: spec.description,
			status,
			timeSpentInMilliseconds: spec.time
		};

		sendEvent({
			name: KarmaEventName.SpecComplete,
			browser: toBrowser(browser),
			results: specResult
		});
	});

	self.emitter.on(KarmaEventName.BrowserComplete, (browser: any, results: any) =>
		sendEvent({
			name: KarmaEventName.BrowserComplete,
			browser: toBrowser(browser),
			results
		})
	);

	self.emitter.on(KarmaEventName.RunComplete, (browsers: any, result: any) =>
		sendEvent({
			name: KarmaEventName.RunComplete,
			browsers: browsers.map(toBrowser),
			results: collectRunState(result)
		})
	);

	self.emitter.on(KarmaEventName.BrowserError, (browser: any, error: any) =>
		sendEvent({
			name: KarmaEventName.BrowserError,
			browser: toBrowser(browser),
			error
		})
	);

	self.emitter.on(KarmaEventName.BrowsersReady, () =>
		sendEvent({
			name: KarmaEventName.BrowsersReady
		})
	);

	self.emitter.on(KarmaEventName.BrowsersChange, (browsers: any) =>
		sendEvent({
			name: KarmaEventName.BrowsersChange,
			browsers: browsers.map(toBrowser)
		})
	);

	// FIXME: Handle more `KarmaEventName` events
}

function configureTimeouts(injector: any) {
	process.nextTick(() => {
		const webServer = injector.get('webServer');
		if (webServer) {
			// IDE posts http '/run' request to trigger tests (see karma-http-client.ts).
			// If a request executes more than `httpServer.timeout`, it will be timed out.
			// Disable timeout, as by default httpServer.timeout=120 seconds, not enough for suspended execution.
			webServer.timeout = 0;
		}
		const socketServer = injector.get('socketServer') as SocketIOServer;
		if (socketServer) {
			// Disable socket.io heartbeat (ping) to avoid browser disconnecting when debugging tests,
			// because no ping requests are sent when test execution is suspended on a breakpoint.
			// Default values are not enough for suspended execution:
			const socketOptions = { pingTimeout, pingInterval };
			Object.assign(socketServer, socketOptions);
		}
	});
}

function collectRunState(runResult: KarmaTestResults): TestRunStatus {
	if (runResult.disconnected) {
		return TestRunStatus.Timeout;
	} else if (runResult.error) {
		return TestRunStatus.Error;
	} else {
		return TestRunStatus.Complete;
	}
}

TestExplorerJasmineReporter.$inject = ['baseReporterDecorator', 'config', 'logger', 'emitter', 'injector'];

export const name = TestExplorerJasmineReporter.name;
export const instance = TestExplorerJasmineReporter;
