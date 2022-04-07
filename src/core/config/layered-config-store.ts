import { ConfigStore } from './config-store';

export class LayeredConfigStore<K extends string = string> implements ConfigStore<K> {
  private readonly layeredConfigs: ConfigStore<K>[];

  public constructor(...layeredConfigs: (ConfigStore<K> | undefined)[]) {
    this.layeredConfigs = layeredConfigs.filter(store => store !== undefined).reverse() as ConfigStore<K>[];
  }

  public get<T>(key: K): T {
    return this.layeredConfigs.find(config => config.has(key))?.get(key) as T;
  }

  public has(key: K): boolean {
    return this.layeredConfigs.some(config => config.has(key));
  }

  public inspect<T>(key: K): { defaultValue?: T | undefined } | undefined {
    return this.layeredConfigs.find(config => config.inspect(key) !== undefined)?.inspect(key);
  }
}
