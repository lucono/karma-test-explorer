import { ChromeBrowserHelper } from './chrome-browser-helper.js';

export class EdgeBrowserHelper extends ChromeBrowserHelper {
  public override readonly supportedBrowsers: readonly [string, ...string[]] = ['Edge'];
  public override readonly debuggerType: string = 'msedge';
}
