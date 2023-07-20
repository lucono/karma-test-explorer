import { BrowserHelper } from './browser-helper.js';
import { ChromeBrowserHelper } from './chrome-helper.js';
import { ElectronBrowserHelper } from './electron-helper.js';
import { FirefoxBrowserHelper } from './firefox-helper.js';
import { MsEdgeBrowserHelper } from './msedge-helper.js';

export class BrowserHelperFactory {
  static BROWSER_HELPER_INSTANCES = [
    new ChromeBrowserHelper(),
    new FirefoxBrowserHelper(),
    new MsEdgeBrowserHelper(),
    new ElectronBrowserHelper()
  ];

  public static getBrowserHelper(browserType: string): BrowserHelper {
    return (
      this.BROWSER_HELPER_INSTANCES.find(helper => helper.isSupportedBrowser(browserType)) ??
      this.BROWSER_HELPER_INSTANCES[0]
    );
  }

  public static isSupportedBrowser(browserType: string): boolean {
    return this.BROWSER_HELPER_INSTANCES.some(helper => helper.isSupportedBrowser(browserType));
  }
}
