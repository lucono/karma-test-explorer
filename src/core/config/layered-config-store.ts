import { ConfigStore, ConfigStoreSettingInfo } from './config-store';

export interface LayeredConfigStoreOptions {
  valuesConsideredAbsent?: any[];
}

export class LayeredConfigStore<K extends string = string> implements ConfigStore<K> {
  private readonly layeredConfigs: ConfigStore<K>[];
  private readonly valuesConsideredAbsent: any[];

  public constructor(layeredConfigs: (ConfigStore<string> | undefined)[], options: LayeredConfigStoreOptions = {}) {
    this.layeredConfigs = layeredConfigs.filter(store => store !== undefined).reverse() as ConfigStore<K>[];
    this.valuesConsideredAbsent = options.valuesConsideredAbsent ?? [];
  }

  public get<T>(key: K): T {
    return this.layeredConfigs
      .find(config => config.has(key) && !this.valuesConsideredAbsent.includes(config.get(key)))
      ?.get(key) as T;
  }

  public has(key: K): boolean {
    return this.layeredConfigs.some(
      config => config.has(key) && !this.valuesConsideredAbsent.includes(config.get(key))
    );
  }

  public inspect<T>(key: K): ConfigStoreSettingInfo<T> | undefined {
    return this.layeredConfigs.find(config => config.inspect(key) !== undefined)?.inspect(key);
  }
}
