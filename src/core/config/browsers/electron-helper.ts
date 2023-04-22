import isDocker from 'is-docker';
import { CustomLauncher } from 'karma';

import { GeneralConfigSetting, ProjectConfigSetting } from '../config-setting.js';
import { ConfigStore } from '../config-store.js';
import { ContainerMode } from '../extension-config.js';
import { BrowserHelper } from './browser-helper.js';

export class ElectronBrowserHelper extends BrowserHelper {
  static DEFAULT_DEBUGGING_PORT: number | undefined;

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
      flags: [`${this.debuggingPortFlag}=${BrowserHelper.DEFAULT_DEBUGGING_PORT}`]
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
}
