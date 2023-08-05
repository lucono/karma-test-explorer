import { DebugConfiguration } from 'vscode';

import { CustomLauncher } from 'karma';

import { ContainerMode } from '../extension-config.js';

export type DebugConfigurationData = Omit<DebugConfiguration, 'name'>;

export type DebuggerConfigOptions = {
  baseDebugConfig?: DebugConfigurationData;
  webRootOverride?: string;
  extraPathMappings?: Readonly<Record<string, string>>;
  extraSourceMapPathOverrides?: Readonly<Record<string, string>>;
  workspaceFolderPath?: string;
};

export interface BrowserHelper {
  readonly supportedBrowsers: readonly [string, ...string[]];
  readonly debuggerType: string;

  isSupportedBrowser(browserType: string): boolean;

  getDebuggerConfig(options?: DebuggerConfigOptions): DebugConfigurationData;

  getDebugPort(
    customLauncher: Readonly<CustomLauncher>,
    debugConfig: Readonly<DebugConfigurationData>
  ): number | undefined;

  getCustomLauncher(
    browserType: string,
    customLaucher: CustomLauncher | undefined,
    containerMode: ContainerMode | undefined,
    isHeadlessMode: boolean
  ): CustomLauncher;

  getCustomLauncherWithDebugPort(
    customLaucher: CustomLauncher,
    debugPort: number | undefined
  ): CustomLauncher | undefined;
}
