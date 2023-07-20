import { DebugConfiguration } from 'vscode';

import isDocker from 'is-docker';
import { CustomLauncher } from 'karma';

import { GeneralConfigSetting, ProjectConfigSetting } from '../config-setting.js';
import { ConfigStore } from '../config-store.js';
import { ContainerMode } from '../extension-config.js';
import { BrowserHelper } from './browser-helper.js';

export class ElectronBrowserHelper implements BrowserHelper {
  public static DEFAULT_DEBUGGING_PORT: number | undefined = 9222;

  public get supportedBrowsers(): string[] {
    return ['Electron'];
  }
  public get debuggerType(): string {
    return 'chrome';
  }
  public get debuggingPortFlag(): string {
    return '--remote-debugging-port';
  }

  public getCustomLauncher(
    browserType: string,
    customLaucher: CustomLauncher | undefined,
    config: ConfigStore<ProjectConfigSetting>
  ): CustomLauncher {
    const customLauncher: CustomLauncher = customLaucher ?? {
      base: browserType,
      flags: [`${this.debuggingPortFlag}=${ElectronBrowserHelper.DEFAULT_DEBUGGING_PORT}`]
    };

    const configuredContainerMode: ContainerMode = config.get(GeneralConfigSetting.ContainerMode);
    const isNonHeadlessMode = !!config.get(GeneralConfigSetting.NonHeadlessModeEnabled);

    const isContainerMode =
      configuredContainerMode === ContainerMode.Enabled
        ? true
        : configuredContainerMode === ContainerMode.Disabled
        ? false
        : isDocker();

    if (!isContainerMode && isNonHeadlessMode) {
      const browserWindowOptions = ((customLauncher as any).browserWindowOptions ??= {});
      browserWindowOptions.webPreferences ??= {};
      browserWindowOptions.webPreferences.show = true;
    }

    return customLauncher;
  }

  public isSupportedBrowser(browserType: string): boolean {
    return this.supportedBrowsers.some(supportedBrowser => browserType.startsWith(supportedBrowser));
  }

  public getDefaultDebuggerConfig(): DebugConfiguration {
    return {
      name: 'Karma Test Explorer Debugging',
      type: this.debuggerType,
      request: 'attach',
      browserAttachLocation: 'workspace',
      address: 'localhost',
      port: ElectronBrowserHelper.DEFAULT_DEBUGGING_PORT,
      timeout: 60000
    };
  }

  public addCustomLauncherDebugPort(customLaucher: CustomLauncher, debugPort: number | undefined): void {
    if (!customLaucher || debugPort === undefined) {
      return;
    }
    customLaucher.flags = customLaucher.flags?.map(flag =>
      flag.startsWith(this.debuggingPortFlag) ? `${this.debuggingPortFlag}=${debugPort}` : flag
    );
  }

  public getDefaultDebugPort(
    customLauncher: Readonly<CustomLauncher>,
    debuggerConfig: Readonly<DebugConfiguration>
  ): number | undefined {
    const isSupportedLaunchType = this.supportedBrowsers.some(browser => customLauncher.base.startsWith(browser));
    const isSupportedDebugConfig = debuggerConfig.type === this.debuggerType;
    if (!isSupportedLaunchType || !isSupportedDebugConfig) {
      return undefined;
    }

    let configuredPort: number | undefined;
    const browserDebugPortFlag = customLauncher.flags?.find(flag => flag.startsWith(this.debuggingPortFlag));

    if (browserDebugPortFlag) {
      const portPosition = browserDebugPortFlag.search(/[0-9]+$/g);
      const portString = portPosition !== -1 ? browserDebugPortFlag.substring(portPosition) : undefined;
      configuredPort = portString ? parseInt(portString, 10) : undefined;
    }

    return configuredPort ?? ElectronBrowserHelper.DEFAULT_DEBUGGING_PORT;
  }
}
