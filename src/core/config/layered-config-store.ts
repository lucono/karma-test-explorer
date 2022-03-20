import { ConfigStore } from './config-store';

export class LayeredConfigStore<K extends string = string> implements ConfigStore<K> {
  private readonly layeredConfigs: ConfigStore[];

  public constructor(baseConfig: ConfigStore, ...layeredConfigs: ConfigStore[]) {
    this.layeredConfigs = [baseConfig, ...layeredConfigs].reverse();
  }

  public get<T>(key: K): T {
    return this.layeredConfigs.find(config => config.has(key))?.get(key) as T;
  }

  public has(key: K): boolean {
    return this.layeredConfigs.some(config => config.has(key));
  }

  public inspect<T>(key: K): { defaultValue?: T | undefined } | undefined {
    return this.layeredConfigs[0].inspect(key);
  }
}
