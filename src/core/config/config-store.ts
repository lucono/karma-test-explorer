export interface ConfigStore<K extends string = string> {
  get<T>(key: K): T;
  has(key: K): boolean;
  inspect<T>(key: K): { defaultValue?: T } | undefined;
}

export interface MutableConfigStore<K extends string = string> extends ConfigStore<K> {
  set(key: K, value: any): void;
}
