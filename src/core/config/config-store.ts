export interface ConfigStore<K extends string = string> {
  get<T>(key: K): T;
  has(key: K): boolean;
  inspect<T>(key: K): ConfigStoreSettingInfo<T> | undefined;
}

export interface MutableConfigStore<K extends string = string> extends ConfigStore<K> {
  set(key: K, value: any): void;
  delete(key: K): void;
  clear(): void;
}

export interface ConfigStoreSettingInfo<T> {
  key: string;
  defaultValue?: T;
  globalValue?: T;
  workspaceValue?: T;
  workspaceFolderValue?: T;
}
