import { DebugConfiguration } from 'vscode';

import { CustomLauncher } from 'karma';

import { isContainerModeEnabled } from '../config-helper.js';
import { ContainerMode } from '../extension-config.js';
import { BrowserHelper } from './browser-helper.js';

export class ChromeBrowserHelper implements BrowserHelper {
  public static DEFAULT_DEBUGGING_PORT: number | undefined = 9222;
  private static NO_SANDBOX_FLAG: string = '--no-sandbox';
  private static HEADLESS_FLAGS: string[] = ['--headless', '--disable-gpu', '--disable-dev-shm-usage'];

  public get supportedBrowsers(): [string, ...string[]] {
    return ['Chrome', 'Chromium', 'Dartium'];
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
    configuredContainerMode: ContainerMode | undefined,
    isNonHeadlessMode: boolean
  ): CustomLauncher {
    if (customLaucher && !this.isSupportedBrowser(customLaucher.base)) {
      return customLaucher;
    }

    const configuredLauncher: CustomLauncher = customLaucher ?? {
      base: this.isSupportedBrowser(browserType) ? browserType : this.supportedBrowsers[0],
      flags: [
        ...ChromeBrowserHelper.HEADLESS_FLAGS,
        `${this.debuggingPortFlag}=${ChromeBrowserHelper.DEFAULT_DEBUGGING_PORT}`
      ]
    };

    const isContainerMode = isContainerModeEnabled(configuredContainerMode);
    let launcherFlags = (configuredLauncher.flags ??= []);

    if (isContainerMode && !launcherFlags.includes(ChromeBrowserHelper.NO_SANDBOX_FLAG)) {
      launcherFlags = [...launcherFlags, ChromeBrowserHelper.NO_SANDBOX_FLAG];
    }

    if (!isContainerMode && !configuredLauncher.base.includes('Headless') && isNonHeadlessMode) {
      launcherFlags = launcherFlags.filter(flag => !ChromeBrowserHelper.HEADLESS_FLAGS.includes(flag));
    }

    const customLauncher: CustomLauncher = { ...configuredLauncher, flags: launcherFlags };
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
      port: ChromeBrowserHelper.DEFAULT_DEBUGGING_PORT,
      timeout: 60000
    };
  }

  public addCustomLauncherDebugPort(
    customLaucher: CustomLauncher,
    debugPort: number | undefined
  ): CustomLauncher | undefined {
    if (!customLaucher || debugPort === undefined) {
      return;
    }

    return {
      ...customLaucher,
      flags: customLaucher.flags?.map(flag =>
        flag.startsWith(this.debuggingPortFlag) ? `${this.debuggingPortFlag}=${debugPort}` : flag
      )
    };
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

    return configuredPort ?? ChromeBrowserHelper.DEFAULT_DEBUGGING_PORT;
  }
}
