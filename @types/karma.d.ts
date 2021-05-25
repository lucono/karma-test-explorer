import { ConfigOptions as KarmaConfigOptions  } from "karma";

declare module "karma" {
  interface Config extends KarmaConfigOptions {}

  interface ConfigOptions {
    detached?: boolean;
    configFile?: string;
    coverageIstanbulReporter?: any;
    reporters: string[];
  }

  interface ClientOptions {
    shardIndex?: number;
    totalShards?: number;
  }

  interface CustomLauncher {
    debug: boolean;
  }

  // interface Reporter {
  //   name: string;
  //   instance: any;
  // }
}
