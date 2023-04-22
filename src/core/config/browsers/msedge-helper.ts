import { ChromeBrowserHelper } from './chrome-helper.js';

export class MsEdgeBrowserHelper extends ChromeBrowserHelper {
  public get supportedBrowsers(): string[] {
    return ['Edge'];
  }
  public get debuggerType(): string {
    return 'msedge';
  }
}
