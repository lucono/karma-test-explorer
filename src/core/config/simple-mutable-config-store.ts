import { ConfigStoreSettingInfo, MutableConfigStore } from './config-store';

export class SimpleMutableConfigStore<K extends string = string> implements MutableConfigStore<K> {
  private configEntries: Map<string, unknown> = new Map();
  private readonly baseKey: string;

  public constructor(initialEntries?: Partial<Record<K, any>>, baseKey?: string) {
    this.baseKey = baseKey ? `${baseKey}.` : '';

    if (initialEntries) {
      this.setMultiple(initialEntries);
    }
  }

  private setMultiple(overrides: Partial<Record<K, any>>): void {
    for (const key in overrides) {
      const value = overrides[key];
      this.set(key, value);
    }
  }

  public set(key: K, value: any): void {
    this.configEntries.set(this.resolveKey(key), value);
  }

  public get<T>(key: K): T {
    return this.configEntries.get(this.resolveKey(key)) as T;
  }

  public has(key: K): boolean {
    return this.configEntries.has(this.resolveKey(key));
  }

  public delete(key: K): void {
    this.configEntries.delete(this.resolveKey(key));
  }

  public clear(): void {
    [...this.configEntries.keys()].forEach(key => this.configEntries.delete(key));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public inspect<T>(key: K): ConfigStoreSettingInfo<T> | undefined {
    return undefined;
  }

  private resolveKey(key: K): string {
    return `${this.baseKey}${key}`;
  }
}
