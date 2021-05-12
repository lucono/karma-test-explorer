import { ConfigOptions as KarmaConfigOptions } from "karma";

declare module "karma" {
  interface Config extends KarmaConfigOptions {}

  interface ConfigOptions {
    detached?: boolean;
    configFile?: string;
    coverageIstanbulReporter?: any;
    reporters: string[];
  }

  interface CustomLauncher {
    debug: boolean;
  }

  // interface Reporter {
  //   name: string;
  //   instance: any;
  // }
}
