import { DebugConfiguration } from 'vscode';

import isDocker from 'is-docker';
import { CustomLauncher } from 'karma';

import { GeneralConfigSetting, ProjectConfigSetting } from '../config-setting.js';
import { ConfigStore } from '../config-store.js';
import { ContainerMode } from '../extension-config.js';
import { BrowserHelper } from './browser-helper.js';

export class FirefoxBrowserHelper implements BrowserHelper {
  public static DEFAULT_DEBUGGING_PORT: number | undefined = 9222;
  private static HEADLESS_FLAGS: string[] = ['-headless'];

  public get supportedBrowsers(): string[] {
    return ['Firefox'];
  }
  public get debuggerType(): string {
    return 'firefox';
  }
  public get debuggingPortFlag(): string {
    return '-start-debugger-server';
  }

  public getCustomLauncher(
    browserType: string,
    customLaucher: CustomLauncher | undefined,
    config: ConfigStore<ProjectConfigSetting>
  ): CustomLauncher {
    const configuredLauncher: CustomLauncher =
      customLaucher ??
      ({
        base: browserType,
        flags: [
          ...FirefoxBrowserHelper.HEADLESS_FLAGS,
          `${this.debuggingPortFlag} ${FirefoxBrowserHelper.DEFAULT_DEBUGGING_PORT}`
        ],
        prefs: {
          'devtools.debugger.remote-enabled': true,
          'devtools.chrome.enabled': true,
          'devtools.debugger.prompt-connection': false
        }
      } as any);

    const configuredContainerMode: ContainerMode = config.get(GeneralConfigSetting.ContainerMode);
    const isNonHeadlessMode = !!config.get(GeneralConfigSetting.NonHeadlessModeEnabled);

    const isContainerMode =
      configuredContainerMode === ContainerMode.Enabled
        ? true
        : configuredContainerMode === ContainerMode.Disabled
        ? false
        : isDocker();

    let launcherFlags = (configuredLauncher.flags ??= []);

    if (!isContainerMode && !configuredLauncher.base.includes('Headless') && isNonHeadlessMode) {
      launcherFlags = launcherFlags.filter(flag => !FirefoxBrowserHelper.HEADLESS_FLAGS.includes(flag));
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
      port: FirefoxBrowserHelper.DEFAULT_DEBUGGING_PORT,
      timeout: 60000
    };
  }

  public addCustomLauncherDebugPort(customLaucher: CustomLauncher, debugPort: number | undefined): void {
    if (!customLaucher || debugPort === undefined) {
      return;
    }
    customLaucher.flags = customLaucher.flags?.map(flag =>
      flag.startsWith(this.debuggingPortFlag) ? `${this.debuggingPortFlag} ${debugPort}` : flag
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

    return configuredPort ?? FirefoxBrowserHelper.DEFAULT_DEBUGGING_PORT;
  }
}
