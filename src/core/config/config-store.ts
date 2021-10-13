export interface ConfigStore {
  get<T>(key: string): T;
  has(key: string): boolean;
  inspect<T>(key: string): { defaultValue?: T } | undefined;
}
