import { CustomLauncher } from 'karma';

import { isContainerModeEnabled } from '../config-helper.js';
import { ContainerMode } from '../extension-config.js';
import { ChromeBrowserHelper } from './chrome-browser-helper.js';

export class ElectronBrowserHelper extends ChromeBrowserHelper {
  public override readonly supportedBrowsers: readonly [string, ...string[]] = ['Electron'];

  public override getCustomLauncher(
    browserType: string,
    customLaucher: CustomLauncher | undefined,
    configuredContainerMode: ContainerMode | undefined,
    isHeadlessMode: boolean
  ): CustomLauncher {
    if (customLaucher && !this.isSupportedBrowser(customLaucher.base)) {
      return customLaucher;
    }

    const configuredLauncher: CustomLauncher = customLaucher ?? {
      base: this.isSupportedBrowser(browserType) ? browserType : this.supportedBrowsers[0],
      flags: [`${this.debuggingPortFlag}=${this.defaultDebuggingPort}`]
    };

    const isContainerMode = isContainerModeEnabled(configuredContainerMode);

    if (!isContainerMode && !isHeadlessMode) {
      const browserWindowOptions = ((configuredLauncher as any).browserWindowOptions ??= {});
      browserWindowOptions.webPreferences ??= {};
      browserWindowOptions.webPreferences.show = true;
    }

    return configuredLauncher;
  }
}
