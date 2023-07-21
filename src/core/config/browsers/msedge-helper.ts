import { ChromeBrowserHelper } from './chrome-helper.js';

export class MsEdgeBrowserHelper extends ChromeBrowserHelper {
  public override get supportedBrowsers(): string[] {
    return ['Edge'];
  }
  public override get debuggerType(): string {
    return 'msedge';
  }
}
