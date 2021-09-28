export interface CommandLineProcessLog {
  output(data: () => string): void;
  error(data: () => string): void;
}
