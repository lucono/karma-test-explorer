import { DebugConfiguration } from 'vscode';

import { CustomLauncher } from 'karma';

import { ContainerMode } from '../extension-config.js';

export interface BrowserHelper {
  supportedBrowsers: [string, ...string[]];
  debuggerType: string;
  debuggingPortFlag: string;

  getCustomLauncher(
    browserType: string,
    customLaucher: CustomLauncher | undefined,
    configuredContainerMode: ContainerMode | undefined,
    isNonHeadlessMode: boolean
  ): CustomLauncher;

  isSupportedBrowser(browserType: string): boolean;

  getDefaultDebuggerConfig(): DebugConfiguration;

  addCustomLauncherDebugPort(customLaucher: CustomLauncher, debugPort: number | undefined): CustomLauncher | undefined;

  getDefaultDebugPort(
    customLauncher: Readonly<CustomLauncher>,
    debuggerConfig: Readonly<DebugConfiguration>
  ): number | undefined;
}
