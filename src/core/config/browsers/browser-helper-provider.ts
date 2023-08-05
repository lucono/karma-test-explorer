import { BrowserHelper } from './browser-helper.js';
import { ChromeBrowserHelper } from './chrome-browser-helper.js';
import { EdgeBrowserHelper } from './edge-browser-helper.js';
import { ElectronBrowserHelper } from './electron-browser-helper.js';
import { FirefoxBrowserHelper } from './firefox-browser-helper.js';

const BROWSER_HELPER_INSTANCES: readonly BrowserHelper[] = [
  new ChromeBrowserHelper(),
  new FirefoxBrowserHelper(),
  new EdgeBrowserHelper(),
  new ElectronBrowserHelper()
];

export class BrowserHelperProvider {
  private readonly defaultProvider: BrowserHelper;

  public constructor(defaultBrowserType?: string) {
    this.defaultProvider =
      BROWSER_HELPER_INSTANCES.find(provider => provider.debuggerType === defaultBrowserType) ??
      BROWSER_HELPER_INSTANCES[0];
  }

  public getBrowserHelper(browserType: string): BrowserHelper {
    return BROWSER_HELPER_INSTANCES.find(helper => helper.isSupportedBrowser(browserType)) ?? this.defaultProvider;
  }

  public getDefaultBrowserHelper(): BrowserHelper {
    return this.defaultProvider;
  }

  public isSupportedBrowser(browserType: string): boolean {
    return BROWSER_HELPER_INSTANCES.some(helper => helper.isSupportedBrowser(browserType));
  }
}
