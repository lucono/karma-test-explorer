import { DebugConfiguration } from 'vscode';

import { CustomLauncher } from 'karma';

import { ProjectConfigSetting } from '../config-setting.js';
import { ConfigStore } from '../config-store.js';

export interface BrowserHelper {
  supportedBrowsers: string[];
  debuggerType: string;
  debuggingPortFlag: string;

  getCustomLauncher(
    browserType: string,
    customLaucher: CustomLauncher | undefined,
    config: ConfigStore<ProjectConfigSetting>
  ): CustomLauncher;

  isSupportedBrowser(browserType: string): boolean;

  getDefaultDebuggerConfig(): DebugConfiguration;

  addCustomLauncherDebugPort(customLaucher: CustomLauncher, debugPort: number | undefined): void;

  getDefaultDebugPort(
    customLauncher: Readonly<CustomLauncher>,
    debuggerConfig: Readonly<DebugConfiguration>
  ): number | undefined;
}
