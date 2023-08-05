import { CustomLauncher } from 'karma';

import { isContainerModeEnabled } from '../config-helper.js';
import { ContainerMode } from '../extension-config.js';
import { BrowserHelper, DebugConfigurationData, DebuggerConfigOptions } from './browser-helper.js';

export class FirefoxBrowserHelper implements BrowserHelper {
  private static readonly DEBUGGER_TYPE: string = 'firefox';
  private static readonly DEFAULT_DEBUGGING_PORT: number | undefined = 6000;
  private static readonly HEADLESS_FLAGS: string[] = ['-headless'];

  private static readonly DEFAULT_DEBUGGER_CONFIG: Readonly<DebugConfigurationData> = {
    type: FirefoxBrowserHelper.DEBUGGER_TYPE,
    request: 'attach',
    host: 'localhost',
    port: FirefoxBrowserHelper.DEFAULT_DEBUGGING_PORT,
    url: 'http://localhost:9876',
    webRoot: '${workspaceFolder}',
    pathMappings: [{ url: 'webpack:///', path: '${workspaceFolder}/' }]
  };

  public readonly supportedBrowsers: readonly [string, ...string[]] = ['Firefox'];
  public readonly debuggerType: string = FirefoxBrowserHelper.DEBUGGER_TYPE;
  public readonly debuggingPortFlag: string = '-start-debugger-server';

  public getCustomLauncher(
    browserType: string,
    customLaucher: CustomLauncher | undefined,
    configuredContainerMode: ContainerMode | undefined,
    isHeadlessMode: boolean
  ): CustomLauncher {
    if (customLaucher && !this.isSupportedBrowser(customLaucher.base)) {
      return customLaucher;
    }

    const configuredLauncher: CustomLauncher =
      customLaucher ??
      ({
        base: this.isSupportedBrowser(browserType) ? browserType : this.supportedBrowsers[0],
        flags: [
          ...FirefoxBrowserHelper.HEADLESS_FLAGS,
          `${this.debuggingPortFlag}=${FirefoxBrowserHelper.DEFAULT_DEBUGGING_PORT}`
        ],
        prefs: {
          'devtools.debugger.remote-enabled': true,
          'devtools.chrome.enabled': true,
          'devtools.debugger.prompt-connection': false
        }
      } as any);

    const isContainerMode = isContainerModeEnabled(configuredContainerMode);
    let launcherFlags = (configuredLauncher.flags ??= []);

    if (!isContainerMode && !configuredLauncher.base.includes('Headless') && !isHeadlessMode) {
      launcherFlags = launcherFlags.filter(flag => !FirefoxBrowserHelper.HEADLESS_FLAGS.includes(flag));
    }

    const customLauncher: CustomLauncher = { ...configuredLauncher, flags: launcherFlags };
    return customLauncher;
  }

  public isSupportedBrowser(browserType: string): boolean {
    return this.supportedBrowsers.some(supportedBrowser =>
      browserType.toLowerCase().startsWith(supportedBrowser.toLowerCase())
    );
  }

  public getDebuggerConfig(options: DebuggerConfigOptions = {}): DebugConfigurationData {
    const baseDebugConfig = options.baseDebugConfig ?? { ...FirefoxBrowserHelper.DEFAULT_DEBUGGER_CONFIG };
    const hasPathMappings = baseDebugConfig.pathMappings || options.extraPathMappings;
    const rawWebRoot: string | undefined = options.webRootOverride ?? baseDebugConfig.webRoot;

    const webRoot =
      rawWebRoot && options.workspaceFolderPath
        ? rawWebRoot?.replace(/\${workspaceFolder}/g, options.workspaceFolderPath)
        : rawWebRoot;

    const replaceWorkspacePath = (path: string) =>
      options.workspaceFolderPath
        ? path
            .replace(/\${webRoot}/g, webRoot ?? options.workspaceFolderPath)
            .replace(/\${workspaceFolder}/g, options.workspaceFolderPath)
        : path;

    const basePathMappings = baseDebugConfig.pathMappings ?? [];
    const rawExtraPathMappings = options.extraPathMappings ?? {};

    const extraPathMappingsAsList =
      Object.keys(rawExtraPathMappings).map(key => ({ url: key, path: rawExtraPathMappings[key] })) ?? [];

    const pathMappings = [...basePathMappings, ...extraPathMappingsAsList].map(({ url, path }) => ({
      url,
      path: replaceWorkspacePath(path)
    }));

    const mergedDebuggerConfig: DebugConfigurationData = { ...baseDebugConfig };

    if (webRoot) {
      mergedDebuggerConfig.webRoot = webRoot;
    }

    if (hasPathMappings) {
      mergedDebuggerConfig.pathMappings = pathMappings;
    }

    return mergedDebuggerConfig;
  }

  public getCustomLauncherWithDebugPort(
    customLaucher: CustomLauncher,
    debugPort: number | undefined
  ): CustomLauncher | undefined {
    if (!customLaucher || debugPort === undefined) {
      return undefined;
    }

    return {
      ...customLaucher,
      flags: customLaucher.flags?.map(flag =>
        flag.startsWith(this.debuggingPortFlag) ? `${this.debuggingPortFlag} ${debugPort}` : flag
      )
    };
  }

  public getDebugPort(
    customLauncher: Readonly<CustomLauncher>,
    debuggerConfig: Readonly<DebugConfigurationData>
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
