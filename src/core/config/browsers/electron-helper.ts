import isDocker from 'is-docker';
import { CustomLauncher } from 'karma';

import { GeneralConfigSetting, ProjectConfigSetting } from '../config-setting.js';
import { ConfigStore } from '../config-store.js';
import { ContainerMode } from '../extension-config.js';
import { ChromeBrowserHelper } from './chrome-helper.js';

export class ElectronBrowserHelper extends ChromeBrowserHelper {
  public override get supportedBrowsers(): string[] {
    return ['Electron'];
  }

  public override getCustomLauncher(
    browserType: string,
    customLaucher: CustomLauncher | undefined,
    config: ConfigStore<ProjectConfigSetting>
  ): CustomLauncher {
    const configuredLauncher: CustomLauncher = customLaucher ?? {
      base: browserType,
      flags: [`${this.debuggingPortFlag}=${ElectronBrowserHelper.DEFAULT_DEBUGGING_PORT}`]
    };

    if (!this.isSupportedBrowser(configuredLauncher.base)) {
      return configuredLauncher;
    }

    const configuredContainerMode: ContainerMode = config.get(GeneralConfigSetting.ContainerMode);
    const isNonHeadlessMode = !!config.get(GeneralConfigSetting.NonHeadlessModeEnabled);

    const isContainerMode =
      configuredContainerMode === ContainerMode.Enabled
        ? true
        : configuredContainerMode === ContainerMode.Disabled
        ? false
        : isDocker();

    if (!isContainerMode && isNonHeadlessMode) {
      const browserWindowOptions = ((configuredLauncher as any).browserWindowOptions ??= {});
      browserWindowOptions.webPreferences ??= {};
      browserWindowOptions.webPreferences.show = true;
    }

    return configuredLauncher;
  }
}
