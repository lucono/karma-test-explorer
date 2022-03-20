import { ConfigStore } from './config-store';

export class SimpleMutableConfigStore<K extends string = string> implements ConfigStore<K> {
  private configOverrides: Map<string, unknown> = new Map();
  private readonly configPrefix: string;

  public constructor(configPrefix?: string, configEntries?: Partial<Record<K, any>>) {
    this.configPrefix = configPrefix ? `${configPrefix}.` : '';

    if (configEntries) {
      this.setAll(configEntries);
    }
  }

  public set(key: K, value: any): void {
    this.configOverrides.set(this.toPrefixedKey(key), value);
  }

  public setAll(overrides: Partial<Record<K, any>>): void {
    for (const key in overrides) {
      const value = overrides[key];
      this.set(key, value);
    }
  }

  public get<T>(key: K): T {
    return this.configOverrides.get(this.toPrefixedKey(key)) as T;
  }

  public has(key: K): boolean {
    return this.configOverrides.has(this.toPrefixedKey(key));
  }

  public inspect<T>(key: K): { defaultValue?: T | undefined } | undefined {
    return undefined;
  }

  private toPrefixedKey(key: K): string {
    return `${this.configPrefix}${key}`;
  }
}
