export enum LogLevel {
  DISABLE = 1,
  ERROR,
  WARN,
  INFO,
  DEBUG,
  TRACE
}

export type LogLevelName = keyof typeof LogLevel;
