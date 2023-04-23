import isDocker from 'is-docker';
import { CustomLauncher } from 'karma';

import { GeneralConfigSetting, ProjectConfigSetting } from '../config-setting.js';
import { ConfigStore } from '../config-store.js';
import { ContainerMode } from '../extension-config.js';
import { BrowserHelper } from './browser-helper.js';

export class FirefoxBrowserHelper extends BrowserHelper {
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
          `${this.debuggingPortFlag} ${BrowserHelper.DEFAULT_DEBUGGING_PORT}`
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

  public addCustomLauncherDebugPort(customLaucher: CustomLauncher, debugPort: number | undefined): void {
    if (!customLaucher || debugPort === undefined) {
      return;
    }
    customLaucher.flags = customLaucher.flags?.map(flag =>
      flag.startsWith(this.debuggingPortFlag) ? `${this.debuggingPortFlag} ${debugPort}` : flag
    );
  }
}
