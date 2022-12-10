import { ConfigOptions as KarmaConfigOptions } from 'karma';

declare module 'karma' {
  interface Config extends KarmaConfigOptions {} // eslint-disable-line @typescript-eslint/no-empty-interface

  interface ConfigOptions {
    detached?: boolean;
    configFile?: string;
    coverageIstanbulReporter?: any;
    reporters?: string[];
    jasmineHtmlReporter?: Record<string, any>;
    coverageReporter?: Record<string, any>;
  }
}
