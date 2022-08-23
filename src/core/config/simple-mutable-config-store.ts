import { MutableConfigStore } from './config-store';

export class SimpleMutableConfigStore<K extends string = string> implements MutableConfigStore<K> {
  private configEntries: Map<string, unknown> = new Map();
  private readonly configPrefix: string;

  public constructor(configPrefix?: string, initialEntries?: Partial<Record<K, any>>) {
    this.configPrefix = configPrefix ? `${configPrefix}.` : '';

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
    this.configEntries.set(this.toPrefixedKey(key), value);
  }

  public get<T>(key: K): T {
    return this.configEntries.get(this.toPrefixedKey(key)) as T;
  }

  public has(key: K): boolean {
    return this.configEntries.has(this.toPrefixedKey(key));
  }

  public delete(key: K): void {
    this.configEntries.delete(this.toPrefixedKey(key));
  }

  public clear(): void {
    [...this.configEntries.keys()].forEach(key => this.configEntries.delete(key));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public inspect<T>(key: K): { defaultValue?: T | undefined } | undefined {
    return undefined;
  }

  private toPrefixedKey(key: K): string {
    return `${this.configPrefix}${key}`;
  }
}
