import { CustomLauncher } from 'karma';

import { isContainerModeEnabled } from '../config-helper.js';
import { ContainerMode } from '../extension-config.js';
import { ChromeBrowserHelper } from './chrome-helper.js';

export class ElectronBrowserHelper extends ChromeBrowserHelper {
  public override get supportedBrowsers(): [string, ...string[]] {
    return ['Electron'];
  }

  public override getCustomLauncher(
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
      flags: [`${this.debuggingPortFlag}=${ElectronBrowserHelper.DEFAULT_DEBUGGING_PORT}`]
    };

    const isContainerMode = isContainerModeEnabled(configuredContainerMode);

    if (!isContainerMode && isNonHeadlessMode) {
      const browserWindowOptions = ((configuredLauncher as any).browserWindowOptions ??= {});
      browserWindowOptions.webPreferences ??= {};
      browserWindowOptions.webPreferences.show = true;
    }

    return configuredLauncher;
  }
}
