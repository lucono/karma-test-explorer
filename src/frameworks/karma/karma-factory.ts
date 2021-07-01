import {
	KarmaCommandLineTestServerExecutor,
	KarmaCommandLineTestServerExecutorOptions
} from './server/karma-command-line-test-server-executor';
import { Logger } from '../../core/logger';
import { ExtensionConfig } from '../../core/extension-config';
import { TestRunExecutor } from '../../api/test-run-executor';
import { TestServerExecutor } from '../../api/test-server-executor';
import { KarmaCommandLineTestRunExecutor } from './runner/karma-command-line-test-run-executor';
import { KarmaHttpTestRunExecutor } from './runner/karma-http-test-run-executor';
import { TestRunner } from '../../api/test-runner';
import { KarmaTestEventListener } from './runner/karma-test-event-listener';
import { KarmaTestRunner } from './runner/karma-test-runner';
import { TestServer } from '../../api/test-server';
import { KarmaServer } from './server/karma-test-server';
import { TestFactory } from '../../api/test-factory';
import { Disposable } from '../../api/disposable';
import { CommandLineProcessLog } from '../../util/commandline-process-handler';
import { KarmaEnvironmentVariable } from './karma-environment-variable';
import { TestLoadProcessor } from './runner/test-load-processor';
import { Log } from '../../core/log';

export class KarmaFactory implements TestFactory {
	private disposables: Disposable[] = [];
	private readonly logger: Logger;

	public constructor(
		private readonly config: ExtensionConfig,
		private readonly serverProcessLog: CommandLineProcessLog,
		private readonly log: Log
	) {
		this.logger = new Logger(log, KarmaFactory.name, config.debugLoggingEnabled);
		this.disposables.push(this.logger);
	}

	public createTestServer(testServerExecutor?: TestServerExecutor): TestServer {
		const serverExecutor = testServerExecutor ?? this.createTestServerExecutor();
		return new KarmaServer(serverExecutor, new Logger(this.log, KarmaServer.name, this.config.debugLoggingEnabled));
	}

	public createTestRunner(
		karmaEventListener: KarmaTestEventListener,
		testLoadProcessor: TestLoadProcessor,
		testRunExecutor?: TestRunExecutor
	): TestRunner {
		const runExecutor = testRunExecutor ?? this.createTestRunExecutor();

		return new KarmaTestRunner(
			runExecutor,
			karmaEventListener,
			testLoadProcessor,
			new Logger(this.log, KarmaTestRunner.name, this.config.debugLoggingEnabled)
		);
	}

	public createTestServerExecutor(): TestServerExecutor {
		return this.createKarmaCommandLineTestServerExecutor();
	}

	public createTestRunExecutor(): TestRunExecutor {
		return this.config.karmaProcessExecutable
			? this.createKarmaCommandLineTestRunExecutor()
			: this.createKarmaHttpTestRunExecutor();
	}

	private createKarmaHttpTestRunExecutor(): KarmaHttpTestRunExecutor {
		this.logger.info(`Creating Karma http test run executor`);

		return new KarmaHttpTestRunExecutor(
			new Logger(this.log, KarmaHttpTestRunExecutor.name, this.config.debugLoggingEnabled)
		);
	}

	private createKarmaCommandLineTestRunExecutor(): KarmaCommandLineTestRunExecutor {
		this.logger.info(`Creating Karma command line test run executor`);

		const environment: { [key: string]: string | undefined } = {
			...process.env,
			...this.config.envFileEnvironment,
			...this.config.env
		};
		return new KarmaCommandLineTestRunExecutor(
			this.config.projectRootPath,
			this.config.baseKarmaConfFilePath,
			this.config.userKarmaConfFilePath,
			{ environment },
			new Logger(this.log, KarmaCommandLineTestRunExecutor.name, this.config.debugLoggingEnabled)
		);
	}

	private createKarmaCommandLineTestServerExecutor(): KarmaCommandLineTestServerExecutor {
		this.logger.info(`Creating Karma test server executor`);

		const environment: { [key: string]: string | undefined } = {
			...process.env,
			...this.config.envFileEnvironment,
			...this.config.env,
			[KarmaEnvironmentVariable.AutoWatchEnabled]: `${this.config.autoWatchEnabled}`,
			[KarmaEnvironmentVariable.AutoWatchBatchDelay]: `${this.config.autoWatchBatchDelay}`,
			[KarmaEnvironmentVariable.Browser]: `${this.config.browser}`,
			[KarmaEnvironmentVariable.CustomLauncher]: JSON.stringify(this.config.customLauncher),
			[KarmaEnvironmentVariable.DebugLoggingEnabled]: `${this.config.debugLoggingEnabled}`
		};
		const options: KarmaCommandLineTestServerExecutorOptions = {
			environment,
			serverProcessLog: this.serverProcessLog
		};

		return new KarmaCommandLineTestServerExecutor(
			this.config.projectRootPath,
			this.config.baseKarmaConfFilePath,
			this.config.userKarmaConfFilePath,
			options,
			new Logger(this.log, KarmaCommandLineTestServerExecutor.name, this.config.debugLoggingEnabled)
		);
	}

	public dispose() {
		this.disposables.forEach(disposable => disposable.dispose());
	}
}
