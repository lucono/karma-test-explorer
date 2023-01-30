import { ConfigStore, ConfigStoreSettingInfo } from './config-store.js';
import { SimpleMutableConfigStore } from './simple-mutable-config-store.js';

export class SimpleConfigStore<K extends string = string> implements ConfigStore<K> {
  private readonly configStore: SimpleMutableConfigStore<K>;

  public constructor(configEntries: Partial<Record<K, any>>, baseKey?: string) {
    this.configStore = new SimpleMutableConfigStore<K>(configEntries, baseKey);
  }

  public get<T>(key: K): T {
    return this.configStore.get<T>(key);
  }

  public has(key: K): boolean {
    return this.configStore.has(key);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public inspect<T>(key: K): ConfigStoreSettingInfo<T> | undefined {
    return undefined;
  }
}
