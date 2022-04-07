export interface ProcessLog {
  output(data: () => string): void;
  error(data: () => string): void;
}
