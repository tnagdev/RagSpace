import { inspect } from 'node:util';
import { currentCorrelationId } from './context';

export type LogLevel = 'fatal' | 'error' | 'warn' | 'log' | 'debug' | 'verbose';

const ALL_LEVELS: LogLevel[] = ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'];

export interface LoggerLike {
  log(message: unknown, ...optionalParams: unknown[]): void;
  warn(message: unknown, ...optionalParams: unknown[]): void;
  error(message: unknown, ...optionalParams: unknown[]): void;
}

// Structurally implements Nest's LoggerService so services can pass it to
// NestFactory.create without this package depending on @nestjs/common.
export class CorrelationLogger implements LoggerLike {
  private levels: LogLevel[];

  constructor(
    private readonly service: string,
    levels: LogLevel[] = process.env.NODE_ENV === 'production' ? ['fatal', 'error', 'warn', 'log'] : ALL_LEVELS,
  ) {
    this.levels = levels;
  }

  setLogLevels(levels: LogLevel[]): void {
    this.levels = levels;
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write('fatal', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams);
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('log', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('verbose', message, optionalParams);
  }

  private write(level: LogLevel, message: unknown, optionalParams: unknown[]): void {
    if (!this.levels.includes(level)) return;
    const params = [...optionalParams];
    const context = params.length > 0 && typeof params[params.length - 1] === 'string' ? params.pop() : undefined;
    const correlationId = currentCorrelationId();
    const parts = [
      new Date().toISOString(),
      level.toUpperCase().padEnd(7),
      `[${this.service}]`,
      context ? `[${context}]` : '',
      correlationId ? `cid=${correlationId}` : '',
      format(message),
      ...params.map(format),
    ].filter(Boolean);
    const stream = level === 'error' || level === 'fatal' ? process.stderr : process.stdout;
    stream.write(parts.join(' ') + '\n');
  }
}

function format(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.stack ?? value.message;
  return inspect(value, { depth: 4, breakLength: Infinity });
}
