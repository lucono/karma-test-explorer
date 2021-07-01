import { WorkspaceConfiguration } from 'vscode';
import { Logger } from './logger';
import { ConfigSetting } from './config-setting';
import { readFileSync } from 'fs';
import { parse as parseEnvironmentFile } from 'dotenv';
import { resolve } from 'path';
import { TestGrouping } from '../api/test-grouping';
import { Disposable } from '../api/disposable';
import * as dotenvExpand from 'dotenv-expand';

export class ExtensionConfig implements Disposable {
	public readonly projectRootPath: string;
	public readonly testsBasePath: string;
	public readonly userKarmaConfFilePath: string;
	public readonly karmaPort: number;
	public readonly baseKarmaConfFilePath: string;
	public readonly karmaProcessExecutable: string;
	public readonly testGrouping: TestGrouping;
	public readonly flattenSingleChildFolders: boolean;
	public readonly testFiles: string[];
	public readonly excludeFiles: string[];
	public readonly reloadWatchedFiles: string[];
	public readonly reloadOnKarmaConfigurationFileChange: boolean;
	public readonly defaultSocketConnectionPort: number;
	public readonly env: { [key: string]: string };
	public readonly envFile: string | undefined;
	public readonly envFileEnvironment: { [key: string]: string };
	public readonly debuggerConfig: any;
	public readonly debugLoggingEnabled: boolean;
	public readonly autoWatchEnabled: boolean;
	public readonly autoWatchBatchDelay: number;
	public readonly browser: string;
	public readonly customLauncher: object;

	public constructor(config: WorkspaceConfiguration, workspaceVSCODEPath: string, private readonly logger: Logger) {
		const workspacePath = workspaceVSCODEPath.replace(/^\/([A-Za-z]):\//, '$1:/');

		this.projectRootPath = resolve(workspacePath, config.get(ConfigSetting.ProjectRootPath) as string);
		this.userKarmaConfFilePath = resolve(this.projectRootPath, config.get(ConfigSetting.KarmaConfFilePath) as string);
		this.karmaPort = config.get(ConfigSetting.KarmaPort) as number;
		this.karmaProcessExecutable = config.get(ConfigSetting.KarmaProcessExecutable) as string;
		this.testsBasePath = resolve(this.projectRootPath, config.get(ConfigSetting.TestsBasePath) as string);
		this.testFiles = config.get(ConfigSetting.TestFiles) as string[];
		this.excludeFiles = config.get(ConfigSetting.ExcludeFiles) as string[];
		this.defaultSocketConnectionPort = config.get(ConfigSetting.DefaultSocketConnectionPort) as number;
		this.debuggerConfig = JSON.parse(JSON.stringify(config.get(ConfigSetting.DebuggerConfig)));
		this.debugLoggingEnabled = config.get(ConfigSetting.DebugLoggingEnabled) as boolean;
		this.autoWatchEnabled = config.get(ConfigSetting.AutoWatchEnabled) as boolean;
		this.autoWatchBatchDelay = config.get(ConfigSetting.AutoWatchBatchDelay) as number;
		this.baseKarmaConfFilePath = resolve(__dirname, '..', 'frameworks', 'karma', 'config', 'karma.conf.js');
		this.testGrouping = config.get(ConfigSetting.TestGrouping) as TestGrouping;
		this.flattenSingleChildFolders = config.get(ConfigSetting.FlattenSingleChildFolders) as boolean;
		this.env = JSON.parse(JSON.stringify(config.get(ConfigSetting.Env)));
		this.customLauncher = JSON.parse(JSON.stringify(config.get(ConfigSetting.CustomLauncher)));
		this.browser = config.get(ConfigSetting.Browser) as string;

		this.reloadOnKarmaConfigurationFileChange = config.get(
			ConfigSetting.ReloadOnKarmaConfigurationFileChange
		) as boolean;

		this.envFile = !this.stringSettingExists(config, ConfigSetting.EnvFile)
			? undefined
			: resolve(this.projectRootPath, config.get(ConfigSetting.EnvFile) as string);

		this.envFileEnvironment = this.getEnvironmentFromFile(this.envFile);

		this.reloadWatchedFiles = (config.get(ConfigSetting.ReloadWatchedFiles) as string[]).map(filePath =>
			resolve(this.projectRootPath, filePath)
		);
	}

	private getEnvironmentFromFile(envFile: string | undefined): { [key: string]: string } {
		if (!envFile) {
			return {};
		}
		this.logger.info(`Reading environment from file: ${envFile}`);

		let envFileEnvironment: { [key: string]: string } = {};

		try {
			const envFileContent: Buffer = readFileSync(envFile!);

			if (!envFileContent) {
				throw new Error(`Failed to read configured environment file: ${envFile}`);
			}
			envFileEnvironment = parseEnvironmentFile(envFileContent);
			dotenvExpand({ parsed: envFileEnvironment });
			const entryCount = Object.keys(envFileEnvironment).length;
			this.logger.info(`Fetched ${entryCount} entries from environment file: ${envFile}`);
		} catch (error) {
			this.logger.error(`Failed to get environment from file '${envFile}': ${error.message ?? error}`);
		}
		return envFileEnvironment;
	}

	private stringSettingExists(config: WorkspaceConfiguration, setting: ConfigSetting): boolean {
		const value: string | undefined = config.get(setting);
		return (value ?? '').trim().length > 0;
	}

	public dispose() {
		this.logger.dispose();
	}
}
