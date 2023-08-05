import { CustomLauncher } from 'karma';

import { transformObject } from '../../../util/utils.js';
import { isContainerModeEnabled } from '../config-helper.js';
import { ContainerMode } from '../extension-config.js';
import { BrowserHelper, DebugConfigurationData, DebuggerConfigOptions } from './browser-helper.js';

export class ChromeBrowserHelper implements BrowserHelper {
  private static readonly NO_SANDBOX_FLAG: string = '--no-sandbox';

  private static readonly HEADLESS_FLAGS: readonly string[] = [
    '--headless',
    '--disable-gpu',
    '--disable-dev-shm-usage'
  ];

  protected readonly defaultDebuggingPort: number | undefined = 9222;
  protected readonly debuggingPortFlag: string = '--remote-debugging-port';

  protected getDefaultDebuggerConfig(): Readonly<DebugConfigurationData> {
    return {
      type: this.debuggerType,
      request: 'attach',
      browserAttachLocation: 'workspace',
      address: 'localhost',
      port: this.defaultDebuggingPort,
      webRoot: '${workspaceFolder}',
      pathMapping: { 'webpack:///': '${workspaceFolder}/' },
      timeout: 60_000
    };
  }

  // --- Public Interface ---

  public readonly debuggerType: string = 'chrome';

  public readonly supportedBrowsers: readonly [string, ...string[]] = ['Chrome', 'Chromium', 'Dartium'];

  public isSupportedBrowser(browserType: string): boolean {
    return this.supportedBrowsers.some(supportedBrowser => browserType.startsWith(supportedBrowser));
  }

  public getDebuggerConfig(options: DebuggerConfigOptions = {}): DebugConfigurationData {
    const baseDebugConfig = options.baseDebugConfig ?? { ...this.getDefaultDebuggerConfig() };
    const hasPathMapping = baseDebugConfig.pathMapping || options.extraPathMappings;
    const hasSourceMapPathOverrides = baseDebugConfig.sourceMapPathOverrides || options.extraSourceMapPathOverrides;
    const rawWebRoot: string | undefined = options.webRootOverride ?? baseDebugConfig.webRoot;

    const webRoot =
      rawWebRoot && options.workspaceFolderPath
        ? rawWebRoot?.replace(/\${workspaceFolder}/g, options.workspaceFolderPath)
        : rawWebRoot;

    const replaceWorkspacePath = (key: string, value: string) => ({
      key,
      value: options.workspaceFolderPath
        ? value
            .replace(/\${webRoot}/g, webRoot ?? options.workspaceFolderPath)
            .replace(/\${workspaceFolder}/g, options.workspaceFolderPath)
        : value
    });

    const pathMapping = transformObject(
      { ...baseDebugConfig.pathMapping, ...options.extraPathMappings },
      replaceWorkspacePath
    );

    const sourceMapPathOverrides = transformObject(
      { ...baseDebugConfig.sourceMapPathOverrides, ...options.extraSourceMapPathOverrides },
      replaceWorkspacePath
    );

    const mergedDebuggerConfig: DebugConfigurationData = { ...baseDebugConfig };

    if (webRoot) {
      mergedDebuggerConfig.webRoot = webRoot;
    }

    if (hasPathMapping) {
      mergedDebuggerConfig.pathMapping = pathMapping;
    }

    if (hasSourceMapPathOverrides) {
      mergedDebuggerConfig.sourceMapPathOverrides = sourceMapPathOverrides;
    }
    return mergedDebuggerConfig;
  }

  public getDebugPort(
    customLauncher: Readonly<CustomLauncher>,
    debugConfig: Readonly<DebugConfigurationData>
  ): number | undefined {
    const isSupportedLaunchType = this.supportedBrowsers.some(browser =>
      customLauncher.base.toLowerCase().startsWith(browser.toLowerCase())
    );

    const isSupportedDebugConfig = debugConfig.type === this.debuggerType;

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

    return configuredPort ?? this.defaultDebuggingPort;
  }

  public getCustomLauncher(
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
      flags: [...ChromeBrowserHelper.HEADLESS_FLAGS, `${this.debuggingPortFlag}=${this.defaultDebuggingPort}`]
    };

    const isContainerMode = isContainerModeEnabled(configuredContainerMode);
    let launcherFlags = (configuredLauncher.flags ??= []);

    if (isContainerMode && !launcherFlags.includes(ChromeBrowserHelper.NO_SANDBOX_FLAG)) {
      launcherFlags = [...launcherFlags, ChromeBrowserHelper.NO_SANDBOX_FLAG];
    }

    if (!isContainerMode && !configuredLauncher.base.includes('Headless') && !isHeadlessMode) {
      launcherFlags = launcherFlags.filter(flag => !ChromeBrowserHelper.HEADLESS_FLAGS.includes(flag));
    }

    const customLauncher: CustomLauncher = { ...configuredLauncher, flags: launcherFlags };
    return customLauncher;
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
        flag.startsWith(this.debuggingPortFlag) ? `${this.debuggingPortFlag}=${debugPort}` : flag
      )
    };
  }
}
