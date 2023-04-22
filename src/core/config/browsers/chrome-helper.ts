import isDocker from 'is-docker';
import { CustomLauncher } from 'karma';

import { GeneralConfigSetting, ProjectConfigSetting } from '../config-setting.js';
import { ConfigStore } from '../config-store.js';
import { ContainerMode } from '../extension-config.js';
import { BrowserHelper } from './browser-helper.js';

export class ChromeBrowserHelper extends BrowserHelper {
  private static NO_SANDBOX_FLAG: string = '--no-sandbox';
  private static HEADLESS_FLAGS: string[] = ['--headless', '--disable-gpu', '--disable-dev-shm-usage'];
  static DEFAULT_DEBUGGING_PORT: number | undefined;

  public get supportedBrowsers(): string[] {
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
    config: ConfigStore<ProjectConfigSetting>
  ): CustomLauncher {
    const configuredLauncher: CustomLauncher = customLaucher ?? {
      base: this.isSupportedBrowser(browserType) ? browserType : this.supportedBrowsers[0],
      flags: [
        ...ChromeBrowserHelper.HEADLESS_FLAGS,
        `${this.debuggingPortFlag}=${BrowserHelper.DEFAULT_DEBUGGING_PORT}`
      ]
    };

    const configuredContainerMode: ContainerMode = config.get(GeneralConfigSetting.ContainerMode);
    const isNonHeadlessMode = !!config.get(GeneralConfigSetting.NonHeadlessModeEnabled);

    const isContainerMode =
      configuredContainerMode === ContainerMode.Enabled
        ? true
        : configuredContainerMode === ContainerMode.Disabled
        ? false
        : isDocker();

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
}
